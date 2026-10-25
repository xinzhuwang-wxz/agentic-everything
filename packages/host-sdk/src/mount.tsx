import React, { useEffect, useMemo, useState } from 'react';
import { AgenticPanel, createConfigurationClient, normalizeReferenceContext, referenceContextKey, ticketSuggestions, type AeContext, type AeReferenceContext, type AeSuggestion, type ConfigurationClient, type AeClient, type RunView, type RuntimeMeta, type FloatingAssistantOptions } from '@ae/ui';
import { ConversationViewSchema, type ApprovalDecision, type CapabilityVersion } from '@ae/contracts';
export type { AeClient, RunView, RuntimeMeta, AeContext, AeReferenceContext, AeSuggestion } from '@ae/ui';
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
  conversations:{
   create:async(context,intent)=>ConversationViewSchema.parse(await request('/conversations',{context:normalizeReferenceContext(context as AeContext)},intent)),
   get:async id=>ConversationViewSchema.parse(await request(`/conversations/${encodeURIComponent(id)}`)),
   start:(id,input,intent)=>request<RunView>(`/conversations/${encodeURIComponent(id)}/runs`,{input},intent),
  },
  meta:()=>request<RuntimeMeta>('/meta'),
  capabilities:async()=>(await request<{capabilities:CapabilityVersion[]}>('/capabilities')).capabilities,
  start:async(input,context)=>{const body={input,context:normalizeReferenceContext(context)};const intent=JSON.stringify(body);const key=pending.get(intent)??globalThis.crypto.randomUUID();pending.set(intent,key);try{const result=await request<RunView>('/runs',body,key);pending.delete(intent);return result}catch(error){if(error instanceof AeTransportError&&error.status<500)pending.delete(intent);throw error}},
  get:runId=>request<RunView>(`/runs/${encodeURIComponent(runId)}`),
  decide:(runId,decision:ApprovalDecision)=>request<RunView>(`/runs/${encodeURIComponent(runId)}/approval`,{approvalId:decision.approvalId,decision:decision.decision,expectedHash:decision.expectedHash}),
  cancel:runId=>request<RunView>(`/runs/${encodeURIComponent(runId)}/cancel`,{}),
 };
}
interface AgenticMountOptions { apiBase:string; client?:AeClient; title?:string; contextLabel?:string; suggestions?:readonly AeSuggestion[]; onRunChange?:(run:RunView)=>void; configurationClient?:ConfigurationClient; sessionKey?:string; floating?:FloatingAssistantOptions; managementVisible?:boolean }
/** The legacy ticket alias and generic reference map are mutually exclusive. */
export type AgenticMountProps = AgenticMountOptions & ({context:AeReferenceContext;ticketId?:never}|{ticketId:string;context?:never});
interface MountScope { canonical:string; storageKey:string; conversationStorageKey:string }
async function genericScope(canonical:string):Promise<MountScope> {
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 const fingerprint=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
 return {canonical,storageKey:`ae:run:v2:${fingerprint}`,conversationStorageKey:`ae:conversation:v2:${fingerprint}`};
}
export function AgenticMount(props:AgenticMountProps){
 const {apiBase,client,title,onRunChange,configurationClient,sessionKey='fixture',floating,managementVisible,contextLabel,suggestions}=props;
 if(props.context!==undefined&&props.ticketId!==undefined)throw new Error('Use context or the legacy ticketId alias, not both');
 const legacy=props.context===undefined;
 const contextKey=referenceContextKey(legacy?{ticketId:props.ticketId!}:props.context!);
 const context=useMemo(()=>JSON.parse(contextKey) as AeReferenceContext,[contextKey]);
 const canonical=JSON.stringify([apiBase,sessionKey,context]);
 const [scope,setScope]=useState<MountScope>();
 const [scopeError,setScopeError]=useState<{canonical:string;message:string}>();
 useEffect(()=>{
  if(legacy)return;
  let alive=true;
  void genericScope(canonical).then(value=>{if(alive)setScope(value)},()=>{if(alive)setScopeError({canonical,message:'无法建立安全的会话恢复命名空间。请在支持 Web Crypto 的安全上下文中打开宿主。'})});
  return()=>{alive=false};
 },[canonical,legacy]);
 const transport=useMemo(()=>client??createAeClient({apiBase}),[apiBase,client,sessionKey]);
 const configuration=useMemo(()=>configurationClient??createConfigurationClient(apiBase),[apiBase,configurationClient,sessionKey]);
 // Preserve the legacy fixture's recovery keys. New reference contexts store only a digest.
 const currentScope=legacy?{storageKey:`ae:run:${apiBase}:${sessionKey}:${props.ticketId}`,conversationStorageKey:`ae:conversation:v1:${canonical}`}:scope?.canonical===canonical?scope:undefined;
 if(!currentScope)return scopeError?.canonical===canonical?<p className="ae-error" role="alert">{scopeError.message}</p>:<p className="ae-muted" role="status">正在连接业务助手…</p>;
 return <AgenticPanel {...(floating?{floating}:{})} {...(managementVisible===undefined?{}:{managementVisible})} key={JSON.stringify([apiBase,sessionKey,contextKey])} configurationClient={configuration} client={transport} context={context} {...currentScope} {...(contextLabel!==undefined?{contextLabel}:legacy?{contextLabel:props.ticketId!}:{})} {...(suggestions!==undefined?{suggestions}:legacy?{suggestions:ticketSuggestions}:{})} {...(title===undefined?{}:{title})} {...(onRunChange===undefined?{}:{onRunChange})}/>;
}
