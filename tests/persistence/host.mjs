// Synthetic host-owned durable state. This is deliberately separate from AE/DBOS tables.
// PostgreSQL commits the business mutation and operation receipt in one transaction.
import pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { PolicyError } from '@ae/policy';

const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const identity = p => [p.tenantId, p.applicationId, p.subjectId];
const asTicket = row => ({ id: row.id, tenantId: row.tenant_id, title: row.title, priority: row.priority, version: row.version });

export function validateDatabaseUrl(databaseUrl) {
  if (!databaseUrl) throw new Error('Pass an isolated synthetic PostgreSQL URL explicitly');
  const target = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1'
    || target.pathname !== '/ae_persistence_qualification' || target.password || target.search || target.hash) {
    throw new Error('Qualification only accepts password-free loopback ae_persistence_qualification database URLs');
  }
}

export class SyntheticDurableHost {
  constructor(databaseUrl) {
    validateDatabaseUrl(databaseUrl);
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  }
  async setup() {
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS qualification_host;
      CREATE TABLE IF NOT EXISTS qualification_host.principals (
        tenant_id text NOT NULL, application_id text NOT NULL, subject_id text NOT NULL,
        roles jsonb NOT NULL, scopes jsonb NOT NULL,
        PRIMARY KEY (tenant_id, application_id, subject_id)
      );
      CREATE TABLE IF NOT EXISTS qualification_host.read_denials (
        tenant_id text NOT NULL, application_id text NOT NULL, subject_id text NOT NULL, target_id text NOT NULL,
        PRIMARY KEY (tenant_id, application_id, subject_id, target_id)
      );
      CREATE TABLE IF NOT EXISTS qualification_host.tickets (
        tenant_id text NOT NULL, application_id text NOT NULL, id text NOT NULL,
        title text NOT NULL, priority text NOT NULL CHECK (priority IN ('low', 'high')),
        version integer NOT NULL, mutation_count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, application_id, id)
      );
      CREATE TABLE IF NOT EXISTS qualification_host.receipts (
        tenant_id text NOT NULL, application_id text NOT NULL, subject_id text NOT NULL,
        operation_id text NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL,
        PRIMARY KEY (tenant_id, application_id, subject_id, operation_id)
      );
      CREATE TABLE IF NOT EXISTS qualification_host.calls (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, kind text NOT NULL,
        tenant_id text NOT NULL, application_id text NOT NULL, subject_id text NOT NULL,
        operation_id text, target_id text, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS qualification_host.model_calls (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_id text NOT NULL,
        request_id text NOT NULL, stage text NOT NULL, messages jsonb NOT NULL,
        worker_pid integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }
  async seed(principal, ticketId) {
    // Each case receives a new subject/ticket. Existing evidence is never cleared.
    await this.pool.query('INSERT INTO qualification_host.principals VALUES ($1,$2,$3,$4,$5)',
      [...identity(principal), JSON.stringify(principal.roles), JSON.stringify(principal.scopes)]);
    await this.pool.query(`INSERT INTO qualification_host.tickets
      (tenant_id,application_id,id,title,priority,version) VALUES ($1,$2,$3,$4,'low',1)`,
    [principal.tenantId, principal.applicationId, ticketId, `Synthetic qualification ${ticketId}`]);
  }
  async revokeWrite(principal) {
    await this.pool.query('UPDATE qualification_host.principals SET roles=$4, scopes=$5 WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3',
      [...identity(principal), JSON.stringify(['viewer']), JSON.stringify(['tickets:read'])]);
  }
  async currentPrincipal(principal, client = this.pool) {
    const { rows } = await client.query('SELECT roles,scopes FROM qualification_host.principals WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3', identity(principal));
    if (!rows[0]) throw new PolicyError('HOST_PRINCIPAL_NOT_FOUND');
    return { tenantId: principal.tenantId, applicationId: principal.applicationId, subjectId: principal.subjectId, ...rows[0] };
  }
  authorize(principal, write) {
    if (!principal.roles.includes('editor') && !(principal.roles.includes('viewer') && !write)) throw new PolicyError('ROLE_DENIED');
    if (!principal.scopes.includes(write ? 'tickets:write' : 'tickets:read')) throw new PolicyError('SCOPE_DENIED');
  }
  async record(kind, principal, operationId, targetId) {
    await this.pool.query('INSERT INTO qualification_host.calls (kind,tenant_id,application_id,subject_id,operation_id,target_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [kind, ...identity(principal), operationId ?? null, targetId ?? null]);
  }
  async read(principal, id) {
    const current = await this.currentPrincipal(principal);
    this.authorize(current, false);
    const denied = await this.pool.query('SELECT 1 FROM qualification_host.read_denials WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3 AND target_id=$4', [...identity(current), id]);
    if (denied.rows.length) throw new PolicyError('RESOURCE_DENIED');
    await this.record('read', current, undefined, id);
    const { rows } = await this.pool.query('SELECT * FROM qualification_host.tickets WHERE tenant_id=$1 AND application_id=$2 AND id=$3', [current.tenantId, current.applicationId, id]);
    if (!rows[0]) throw new PolicyError('HOST_TICKET_NOT_FOUND');
    return asTicket(rows[0]);
  }
  async write(principal, request) {
    await this.record('write', principal, request.operationId, request.targetId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.currentPrincipal(principal, client);
      this.authorize(current, true);
      const args = request.arguments;
      if (request.capabilityId !== 'change_ticket_priority' || request.targetId !== args.ticketId
        || !['low', 'high'].includes(args.priority) || !Number.isInteger(args.expectedVersion)) throw new PolicyError('HOST_INVALID_REQUEST');
      // Row lock serializes mutation+receipt for this target, including concurrent retries.
      const { rows } = await client.query('SELECT * FROM qualification_host.tickets WHERE tenant_id=$1 AND application_id=$2 AND id=$3 FOR UPDATE',
        [current.tenantId, current.applicationId, args.ticketId]);
      if (!rows[0]) throw new PolicyError('HOST_TICKET_NOT_FOUND');
      const old = await client.query('SELECT * FROM qualification_host.receipts WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3 AND operation_id=$4',
        [...identity(current), request.operationId]);
      const requestHash = hash(request);
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== requestHash) throw new PolicyError('HOST_IDEMPOTENCY_CONFLICT');
        await client.query('COMMIT');
        return old.rows[0].result;
      }
      if (rows[0].version !== args.expectedVersion) throw new PolicyError('RESOURCE_VERSION_CONFLICT');
      const updated = await client.query(`UPDATE qualification_host.tickets SET priority=$4,version=version+1,mutation_count=mutation_count+1
        WHERE tenant_id=$1 AND application_id=$2 AND id=$3 RETURNING *`, [current.tenantId, current.applicationId, args.ticketId, args.priority]);
      const result = { status: 'succeeded', operationId: request.operationId, receiptId: randomUUID(), data: asTicket(updated.rows[0]) };
      await client.query('INSERT INTO qualification_host.receipts VALUES ($1,$2,$3,$4,$5,$6)',
        [...identity(current), request.operationId, requestHash, JSON.stringify(result)]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async query(principal, operationId) {
    const current = await this.currentPrincipal(principal);
    this.authorize(current, false);
    await this.record('query', current, operationId);
    const { rows } = await this.pool.query('SELECT result FROM qualification_host.receipts WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3 AND operation_id=$4',
      [...identity(current), operationId]);
    return rows[0]?.result ?? { status: 'outcome-unknown', operationId, message: 'No authoritative synthetic host receipt. Do not retry the mutation.' };
  }
  async inspect(principal, ticketId, runId) {
    const ticket = await this.pool.query('SELECT * FROM qualification_host.tickets WHERE tenant_id=$1 AND application_id=$2 AND id=$3', [principal.tenantId, principal.applicationId, ticketId]);
    const receipts = await this.pool.query('SELECT result FROM qualification_host.receipts WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3 ORDER BY operation_id', identity(principal));
    const calls = await this.pool.query('SELECT kind,operation_id,target_id FROM qualification_host.calls WHERE tenant_id=$1 AND application_id=$2 AND subject_id=$3 ORDER BY id', identity(principal));
    const model = runId ? await this.pool.query('SELECT request_id,stage,messages,worker_pid FROM qualification_host.model_calls WHERE run_id=$1 ORDER BY id', [runId]) : { rows: [] };
    return { ticket: asTicket(ticket.rows[0]), mutationCount: ticket.rows[0].mutation_count, receipts: receipts.rows.map(row => row.result), calls: calls.rows, model: model.rows };
  }
  async close() { await this.pool.end(); }
}

export function createModel(host) {
  return { async complete(request) {
    // Stateless simulated provider: derive the next turn from SDK conversation messages.
    // Nothing is keyed to process-local counters, so fresh processes cannot hide replay.
    const toolMessages = request.messages.filter(message => message.role === 'tool');
    const input = request.messages.find(message => message.role === 'user')?.content ?? '';
    const extraTicket = /extra-ticket:([a-zA-Z0-9_-]+)/.exec(input)?.[1];
    const stage = extraTicket && toolMessages.length === 0 ? 'extra-read' : toolMessages.length === (extraTicket ? 1 : 0) ? 'read' : toolMessages.length === (extraTicket ? 2 : 1) ? 'write' : 'final';
    const ticketId = /qualification-ticket:([a-zA-Z0-9_-]+)/.exec(input)?.[1];
    if (!ticketId) throw new Error('Missing explicit synthetic ticket in model input');
    await host.pool.query('INSERT INTO qualification_host.model_calls (run_id,request_id,stage,messages,worker_pid) VALUES ($1,$2,$3,$4,$5)',
      [request.runId, request.requestId, stage, JSON.stringify(request.messages), process.pid]);
    const toolCalls = stage === 'extra-read' ? [{ callId: 'qualified-extra-read', name: 'read_ticket', arguments: { ticketId: extraTicket } }] : stage === 'read' ? [{ callId: 'qualified-read-1', name: 'read_ticket', arguments: { ticketId } }]
      : stage === 'write' ? [{ callId: 'qualified-write-1', name: 'change_ticket_priority', arguments: { ticketId, priority: 'high', expectedVersion: 1 } }] : [];
    return { schemaVersion: '1', requestId: request.requestId, mode: 'simulated', message: stage === 'final' ? 'The durable host receipt confirms high priority.' : '',
      toolCalls, finishReason: toolCalls.length ? 'tool-calls' : 'stop' };
  } };
}
