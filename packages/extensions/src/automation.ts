import { DBOS, type DBOSClient } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';
import { PrincipalSchema, type Principal } from '@ae/contracts';
import { PolicyError, samePrincipal } from '@ae/policy';
import { currentPrincipal, digest, intentId, type ExtensionAuthority, type ExtensionRuntime } from './runtime.js';

const instant = z.iso.datetime();
export const DailyAutomationSchema = z.strictObject({
  automationId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  principal: PrincipalSchema,
  input: z.string().trim().min(1).max(16384),
  hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59),
  timezone: z.string().min(1).max(80),
  startsAt: instant, endsAt: instant,
  maxLatenessMs: z.number().int().min(1000).max(3600000),
});
export type DailyAutomation = z.infer<typeof DailyAutomationSchema>;
type Schedule = Awaited<ReturnType<typeof DBOS.getSchedule>>;
export type SchedulePort = Pick<typeof DBOS, 'createSchedule' | 'getSchedule' | 'pauseSchedule' | 'resumeSchedule'>;
/** Client lookups are live on replay; DBOS.getSchedule inside a workflow would checkpoint the old pause state. */
export function dbosSchedulePort(client: DBOSClient): SchedulePort {
  return { createSchedule: options => DBOS.createSchedule(options), getSchedule: name => client.getSchedule(name), pauseSchedule: name => client.pauseSchedule(name), resumeSchedule: name => client.resumeSchedule(name) };
}
export type AutomationResult = { status: 'started'; runId: string } | { status: 'skipped'; reason: 'paused-or-deleted' | 'outside-window' | 'late' | 'not-due' };

export function validateAutomation(raw: unknown): DailyAutomation {
  const value = DailyAutomationSchema.parse(raw);
  try { new Intl.DateTimeFormat('en-US', { timeZone: value.timezone }).format(); } catch { throw new PolicyError('AUTOMATION_TIMEZONE_INVALID'); }
  const duration = Date.parse(value.endsAt) - Date.parse(value.startsAt);
  if (duration <= 0 || duration > 31 * 86400000) throw new PolicyError('AUTOMATION_WINDOW_INVALID');
  return value;
}
function name(value: DailyAutomation): string { return `ae-daily-v1-${digest([value.principal.tenantId, value.principal.applicationId, value.principal.subjectId, value.automationId])}`; }
function due(time: Date, value: DailyAutomation): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: value.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(time);
  const part = (key: string) => Number(parts.find(p => p.type === key)?.value);
  return part('hour') === value.hour && part('minute') === value.minute && part('second') === 0 && time.getUTCMilliseconds() === 0;
}
/** Opt-in registration only. Construction does not create a recurring schedule. DBOS owns all scheduling/recovery. */
export class BoundedAutomation {
  private readonly workflow: (date: Date, context: unknown) => Promise<void>;
  constructor(private readonly runtime: ExtensionRuntime, private readonly authority: ExtensionAuthority,
    private readonly schedules: SchedulePort, private readonly now: () => number = Date.now) {
    this.workflow = DBOS.registerWorkflow(async (date: Date, context: unknown) => { await this.dispatch(date, context); }, { name: 'ae-bounded-daily-v1' });
  }
  async create(raw: unknown, actor: Principal): Promise<string> {
    const value = validateAutomation(raw);
    const current = await currentPrincipal(this.authority, actor);
    if (!samePrincipal(current, value.principal)) throw new PolicyError('AUTOMATION_OWNER_DENIED');
    if (Date.parse(value.endsAt) <= this.now()) throw new PolicyError('AUTOMATION_EXPIRED');
    const scheduleName = name(value);
    const existing = await this.schedules.getSchedule(scheduleName);
    if (existing) { this.assertDefinition(existing, value); return scheduleName; }
    await this.schedules.createSchedule({ scheduleName, workflowFn: this.workflow, schedule: `${value.minute} ${value.hour} * * *`, context: value,
      options: { cronTimezone: value.timezone, automaticBackfill: false } });
    return scheduleName;
  }
  async setPaused(raw: unknown, actor: Principal, paused: boolean): Promise<void> {
    const value = validateAutomation(raw);
    const current = await currentPrincipal(this.authority, actor);
    if (!samePrincipal(current, value.principal)) throw new PolicyError('AUTOMATION_OWNER_DENIED');
    const schedule = await this.schedules.getSchedule(name(value));
    if (!schedule) throw new PolicyError('AUTOMATION_NOT_FOUND');
    this.assertDefinition(schedule, value);
    if (!paused && Date.parse(value.endsAt) <= this.now()) throw new PolicyError('AUTOMATION_EXPIRED');
    await (paused ? this.schedules.pauseSchedule(name(value)) : this.schedules.resumeSchedule(name(value)));
  }
  /** Used by DBOS, and by explicitly local fixture recovery/backfill qualification. Never an HTTP endpoint. */
  async dispatch(date: Date, raw: unknown): Promise<AutomationResult> {
    const value = validateAutomation(raw);
    if (!Number.isFinite(date.getTime())) throw new PolicyError('AUTOMATION_TIME_INVALID');
    const schedule = await this.schedules.getSchedule(name(value));
    if (!schedule || schedule.status !== 'ACTIVE') return { status: 'skipped', reason: 'paused-or-deleted' };
    this.assertDefinition(schedule, value);
    const now = this.now();
    if (date.getTime() < Date.parse(value.startsAt) || date.getTime() >= Date.parse(value.endsAt) || now >= Date.parse(value.endsAt) || date.getTime() > now) return { status: 'skipped', reason: 'outside-window' };
    if (now - date.getTime() > value.maxLatenessMs) return { status: 'skipped', reason: 'late' };
    if (!due(date, value)) return { status: 'skipped', reason: 'not-due' };
    const principal = await currentPrincipal(this.authority, value.principal);
    const release = await this.authority.release(principal);
    // Stable schedule definition and UTC occurrence identify one intent, including DST's repeated local hour.
    const runId = intentId('automation-v1', principal, [name(value), digest(value), date.toISOString()]);
    await this.runtime.start({ runId, principal, ...release, input: value.input });
    return { status: 'started', runId };
  }
  private assertDefinition(schedule: NonNullable<Schedule>, value: DailyAutomation): void {
    if (schedule.workflowName !== 'ae-bounded-daily-v1' || schedule.workflowClassName !== '' || schedule.applicationName !== 'ae-persistent-runtime' || digest(validateAutomation(schedule.context)) !== digest(value) || schedule.schedule !== `${value.minute} ${value.hour} * * *` || schedule.cronTimezone !== value.timezone || schedule.automaticBackfill) throw new PolicyError('AUTOMATION_DEFINITION_DRIFT');
  }
}
