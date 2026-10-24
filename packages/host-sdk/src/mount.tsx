import React, { useMemo } from 'react';
import { AgenticPanel, createConfigurationClient, type ConfigurationClient, type AeClient, type RunView, type RuntimeMeta } from '@ae/ui';
import type { ApprovalDecision, CapabilityVersion } from '@ae/contracts';
export type { AeClient, RunView, RuntimeMeta } from '@ae/ui';
export class AeTransportError extends Error { constructor(public readonly code:string,message:string,public readonly status:number){super(message);this.name='AeTransportError';} }
export interface AeClientOptions { apiBase:string; fetch?:typeof globalThis.fetch }
/** The browser carries context, never principal, tenant, role or approval authority. */
export function createAeClient({apiBase,fetch:fetcher=globalThis.fetch}:AeClientOptions):AeClient {
 if(!apiBase.trim())throw new Error('apiBase must explicitly identify the host API');
 const base=apiBase.replace(/\/$/,'');
 async function request<T>(path:string,body?:unknown,idempotencyKey?:string):Promise<T>{
  const response=await fetcher(`${base}${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{Accept:'application/json'}:{Accept:'application/json','Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json() as T&{error?:{code?:string;message?:string}};
  if(!response.ok)throw new AeTransportError(data.error?.code??'HTTP_ERROR',data.error?.message??`HTTP ${response.status}`,response.status);
  return data;
 }
 const pending = new Map<string,string>();
 return {
  meta:()=>request<RuntimeMeta>('/meta'),
  capabilities:async()=>(await request<{capabilities:CapabilityVersion[]}>('/capabilities')).capabilities,
  start:async(input,context)=>{const body={input,context:{ticketId:context.ticketId}};const intent=JSON.stringify(body);const key=pending.get(intent)??globalThis.crypto.randomUUID();pending.set(intent,key);try{const result=await request<RunView>('/runs',body,key);pending.delete(intent);return result}catch(error){if(error instanceof AeTransportError&&error.status<500)pending.delete(intent);throw error}},
  get:runId=>request<RunView>(`/runs/${encodeURIComponent(runId)}`),
  decide:(runId,decision:ApprovalDecision)=>request<RunView>(`/runs/${encodeURIComponent(runId)}/approval`,{approvalId:decision.approvalId,decision:decision.decision,expectedHash:decision.expectedHash}),
  cancel:runId=>request<RunView>(`/runs/${encodeURIComponent(runId)}/cancel`,{}),
 };
}
export interface AgenticMountProps { apiBase:string; ticketId:string; client?:AeClient; title?:string; onRunChange?:(run:RunView)=>void; configurationClient?:ConfigurationClient; sessionKey?:string }
export function AgenticMount({apiBase,ticketId,client,title,onRunChange,configurationClient,sessionKey='fixture'}:AgenticMountProps){
 const transport=useMemo(()=>client??createAeClient({apiBase}),[apiBase,client,sessionKey]);
 const configuration=useMemo(()=>configurationClient??createConfigurationClient(apiBase),[apiBase,configurationClient,sessionKey]);
 return <AgenticPanel key={sessionKey} configurationClient={configuration} client={transport} context={{ticketId}} storageKey={`ae:run:${apiBase}:${sessionKey}:${ticketId}`} {...(title===undefined?{}:{title})} {...(onRunChange===undefined?{}:{onRunChange})}/>;
}
