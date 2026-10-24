import type { ApprovalBinding, ApprovalDecision, CapabilityVersion, JsonObject, RunEvent, RunStatus, ToolResult } from '@ae/contracts';
export interface RunView { runId:string; releaseId?:string; status:RunStatus; events:RunEvent[]; approval?:{binding:ApprovalBinding;expectedHash:string;preview:JsonObject}; message?:string; receipts:ToolResult[] }
export interface RuntimeMeta { mode:'simulated'|'provider'; simulationKind?:'subagent_api'; durability?:'memory_fixture'|'postgres_qualified'; applicationName:string; releaseId:string }
export interface AeClient {
  meta():Promise<RuntimeMeta>;
  capabilities():Promise<CapabilityVersion[]>;
  start(input:string,context:{ticketId:string}):Promise<RunView>;
  get(runId:string):Promise<RunView>;
  decide(runId:string,decision:ApprovalDecision):Promise<RunView>;
  cancel(runId:string):Promise<RunView>;
}
