import { serve } from '@hono/node-server';
import { GovernedRuntime } from '@ae/runtime-core';
import { InMemoryControlPlane } from '@ae/control-plane';
import { AuthorizedTicketHost, ToolBroker, ticketCapabilities, syntheticTitleCatalog } from '@ae/capabilities';
import { FileModelProvider } from '@ae/runtime-adapters';
import type { Principal } from '@ae/contracts';
import { readTicket, changePriority } from '../../../fixtures/existing-react-helpdesk/src/tickets.js';
import { createApi } from './app.js';

const port = Number(process.env.AE_API_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid loopback API port');
const directory = process.env.AE_MODEL_IPC_DIR;
if (!directory) throw new Error('AE_MODEL_IPC_DIR is required; start the independent model actor for this private fixture directory.');
// Synthetic server-owned identity, not a login or persistent credential. Never select it from client headers/body.
const fixturePrincipal: Principal = { tenantId: 'tenant-a', applicationId: 'helpdesk', subjectId: 'fixture-editor', roles: ['editor', 'agentic:admin'], scopes: ['tickets:read', 'tickets:write'] };
const broker = new ToolBroker(new AuthorizedTicketHost({ readTicket, changePriority }));
const runtime = new GovernedRuntime({ broker, model: new FileModelProvider(directory), maxTurns: 8 });
const controlPlane = new InMemoryControlPlane(ticketCapabilities, p => p, syntheticTitleCatalog);
const app = createApi({ runtime, broker, controlPlane, resolvePrincipal: () => fixturePrincipal, releaseId: 'helpdesk-fixture-v1', applicationName: 'Existing React Helpdesk', apiOrigin: `http://127.0.0.1:${port}`, allowedOrigin: process.env.AE_UI_ORIGIN ?? 'http://127.0.0.1:5173' });
serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => process.stdout.write(`AE simulated API listening at http://127.0.0.1:${port}; memory fixture, no production authentication or durability.\n`));
