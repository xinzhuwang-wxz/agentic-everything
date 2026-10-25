import type { ConversationContext, ConversationView, ApprovalBinding, ApprovalDecision, CapabilityVersion, JsonObject, RunEvent, RunStatus, ToolResult } from '@ae/contracts';
import type { AeContext } from './context.js';
export interface RunView { runId:string; releaseId?:string; status:RunStatus; events:RunEvent[]; approval?:{binding:ApprovalBinding;expectedHash:string;preview:JsonObject}; message?:string; receipts:ToolResult[] }
export interface RuntimeMeta { mode:'simulated'|'provider'; simulationKind?:'subagent_api'; durability?:'memory_fixture'|'postgres_qualified'; applicationName:string; releaseId:string; conversationMode?:'bounded-v1' }
export interface AeConversationClient {
  create(context:ConversationContext,intent:string):Promise<ConversationView>;
  get(conversationId:string):Promise<ConversationView>;
  start(conversationId:string,input:string,intent:string):Promise<RunView>;
}
export interface AeClient {
  conversations?:AeConversationClient;
  meta():Promise<RuntimeMeta>;
  capabilities():Promise<CapabilityVersion[]>;
  start(input:string,context:AeContext):Promise<RunView>;
  get(runId:string):Promise<RunView>;
  decide(runId:string,decision:ApprovalDecision):Promise<RunView>;
  cancel(runId:string):Promise<RunView>;
}
