import { normalizeReferenceContext, referenceContextKey, genericSuggestions, ticketSuggestions, type AeContext, type AeSuggestion } from './context.js';
import { FloatingAssistant, type FloatingAssistantOptions } from './floating.js';
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ConversationSession, type ConversationSnapshot } from './conversation-session.js';
import { ConfigurationPanel, type ConfigurationClient } from './configuration.js';
import { AIInput } from './reuse/ai-input.js';
import { StatusIsland } from './reuse/status-island.js';
import * as Tabs from '@radix-ui/react-tabs';
import type { CapabilityVersion } from '@ae/contracts';
import type { AeClient, RuntimeMeta, RunView } from './types.js';
export type { AeClient, RuntimeMeta, RunView } from './types.js';
export interface AgenticPanelProps { client:AeClient; context:AeContext; contextLabel?:string; suggestions?:readonly AeSuggestion[]; title?:string; storageKey?:string; conversationStorageKey?:string; onRunChange?:(run:RunView)=>void; configurationClient?:ConfigurationClient; floating?:FloatingAssistantOptions; managementVisible?:boolean }
const labels:Record<string,string>={queued:'等待执行',running:'正在执行', 'awaiting-approval':'等待你的确认',succeeded:'已完成',failed:'执行失败',rejected:'已拒绝',cancelled:'已取消','outcome-unknown':'结果未知',reconciling:'正在核对结果','manual-review':'需要人工核查'};
const active = new Set(['queued','running','reconciling']);
const inspect = (value:unknown) => JSON.stringify(value,null,2);
const emptyConversation:ConversationSnapshot={connected:false,busy:false,pending:false,error:'',recoveryInputRequired:false};
const noSubscription=()=>()=>{}; const emptySnapshot=()=>emptyConversation;
export function AgenticPanel({client,context,contextLabel:hostContextLabel,suggestions:hostSuggestions,title='业务助手',storageKey,conversationStorageKey,onRunChange,configurationClient,floating,managementVisible=true}:AgenticPanelProps) {
 const contextKey=referenceContextKey(context);
 const contextLabel=hostContextLabel??('ticketId' in context?context.ticketId??'当前页面':'当前页面');
 const references=useMemo(()=>normalizeReferenceContext(context),[contextKey]);
 const suggestions=hostSuggestions??(Object.keys(references).length===1&&'ticketId' in references?ticketSuggestions:genericSuggestions);
 const [pendingInput,setPendingInput]=useState('');
 const [selectedTab,setSelectedTab]=useState(floating?'capabilities':'assistant');
 const [meta,setMeta]=useState<RuntimeMeta>(); const [capabilities,setCapabilities]=useState<CapabilityVersion[]>([]);
 const [runSnapshot,setRunSnapshot]=useState<{view:RunView;generation:number}>();
 const conversationMode=meta?.conversationMode==='bounded-v1';
 const session=useMemo(()=>conversationMode&&client.conversations?new ConversationSession(client.conversations,id=>client.get(id),references,conversationStorageKey??(storageKey?`ae:conversation:v1:${storageKey}`:undefined)):undefined,[client,contextKey,storageKey,conversationStorageKey,conversationMode]);
 const conversationState=useSyncExternalStore(session?.subscribe??noSubscription,session?.getSnapshot??emptySnapshot,emptySnapshot);
 useEffect(()=>{if(session)void session.connect();return()=>session?.dispose()},[session]);
 const run=session?conversationState.run:runSnapshot?.view;
 const setRun=(view:RunView|undefined)=>setRunSnapshot(view?{view,generation:generation.current}:undefined);
 const onRunChangeRef=useRef(onRunChange);
 const lastNotification=useRef<string|undefined>(undefined);
 useEffect(()=>{onRunChangeRef.current=onRunChange},[onRunChange]); const [draft,setDraft]=useState({contextKey:contextKey,value:''}); const input=draft.contextKey===contextKey?draft.value:''; const setInput=(value:string)=>setDraft({contextKey:contextKey,value}); const [legacyError,setError]=useState(''); const [legacyBusy,setBusy]=useState(false); const [lastInput,setLastInput]=useState('');
 const locked=useRef(false); const generation=useRef(0); const [legacyConnected,setConnected]=useState(false);
 const error=session?conversationState.error:legacyError;const busy=session?conversationState.busy:legacyBusy;const connected=session?conversationState.connected:legacyConnected;
 useEffect(()=>{
  let alive=true;
  generation.current++;
  lastNotification.current=undefined;
  setRun(undefined); setError(''); setConnected(false); setMeta(undefined);
  setCapabilities([]); setLastInput(''); setPendingInput(''); setInput('');
  locked.current=true; setBusy(true);
  async function connect(){
   try {
    const [m,c]=await Promise.all([client.meta(),client.capabilities()]);
    if(!alive)return;
    setMeta(m); setCapabilities(c);
    if(m.conversationMode==='bounded-v1'){if(!client.conversations)throw new Error('客户端不支持当前会话协议');setConnected(true);return;}
    let saved:string|null=null;
    try{if(storageKey)saved=sessionStorage.getItem(storageKey)}catch{}
    if(saved){
     try{const restored=await client.get(saved);if(alive)setRun(restored)}
     catch{if(alive)setError('上次执行状态无法恢复，请核查运行时记录。');return}
    }
    if(alive)setConnected(true);
   }catch(e){if(alive)setError(`无法连接运行时：${e instanceof Error?e.message:'未知错误'}`)}
   finally{if(alive){locked.current=false;setBusy(false)}}
  }
  void connect();
  return ()=>{alive=false;generation.current++};
 },[client,contextKey,storageKey]);
 // Callback identity is not an observable run change. Notify before a parent
 // refresh can rerender us, and reject a snapshot owned by an older context.
 useEffect(()=>{
  if(!run||(!session&&(!runSnapshot||runSnapshot.generation!==generation.current)))return;
  const view=run;
  const signature=JSON.stringify(view,(_key,value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
  if(signature===lastNotification.current)return;
  lastNotification.current=signature;
  onRunChangeRef.current?.(view);
 },[run,runSnapshot,session]);
 useEffect(()=>{if(!session&&storageKey&&runSnapshot&&runSnapshot.generation===generation.current){try{sessionStorage.setItem(storageKey,runSnapshot.view.runId)}catch{}}},[session,storageKey,run?.runId]);
 useEffect(()=>{if(session||!run||!active.has(run.status))return;const current=generation.current;let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const next=await client.get(run.runId);if(!stopped&&current===generation.current){setRun(next);setError('');timer=setTimeout(poll,1000)}}catch{if(!stopped&&current===generation.current){setError('连接中断，执行结果尚未确认。请刷新状态，不要重复提交。');}}};
  timer=setTimeout(poll,1000);return()=>{stopped=true;clearTimeout(timer)};
 },[client,session,run?.runId,run?.status]);
 async function perform(action:()=>Promise<RunView>){if(session){await session.perform(()=>action());return;}if(locked.current)return;locked.current=true;setBusy(true);setError('');const current=generation.current;try{const next=await action();if(current===generation.current){setRun(next);setPendingInput('')}}catch(e){if(current===generation.current)setError(`${e instanceof Error?e.message:'请求失败'}。状态未确认，请刷新状态后再操作。`)}finally{if(current===generation.current){locked.current=false;setBusy(false)}}}
 const unresolved=session?!session.canStart():!!pendingInput||!!run&&(active.has(run.status)||run.status==='awaiting-approval'||run.status==='outcome-unknown'||run.status==='manual-review');
 const refreshConfiguration=useCallback(async()=>{const current=generation.current;try{const [m,c]=await Promise.all([client.meta(),client.capabilities()]);if(current===generation.current){setMeta(m);setCapabilities(c)}}catch{if(current===generation.current)setError('发布已返回，但当前能力视图刷新失败。请重新加载核对。')}},[client]);
 const approval=run?.status==='awaiting-approval'?run.approval:undefined;
 const expired=approval ? Date.parse(approval.binding.expiresAt)<=Date.now():false;
 const assistantContent=<div className="ae-assistant-content">
   {!run&&!conversationState.conversation?.messages.length&&<div className="ae-welcome"><span className="ae-orbit" aria-hidden="true">✳</span><h3>理解上下文，再采取行动。</h3><p>先读取业务数据。任何修改都会展示预览，确认后才交给服务端执行。</p><div className="ae-suggestions">{suggestions.map((suggestion,index)=><button key={`${index}:${suggestion.label}`} disabled={!connected||busy} onClick={()=>setInput(suggestion.input)}>{suggestion.label} <span>↗</span></button>)}</div></div>}
   {session&&conversationState.conversation&&<div className="ae-history" aria-label="会话历史">{conversationState.conversation.messages.map(message=><article key={message.messageId} className={message.role==='user'?'ae-user-message':'ae-result'} data-message-id={message.messageId}><strong>{message.role==='user'?'你':'AE'}</strong><p>{message.text}</p></article>)}{conversationState.conversation.runs.filter(item=>!conversationState.conversation!.messages.some(message=>message.runId===item.runId&&message.role==='assistant')&&item.runId!==run?.runId).map(item=><p key={item.runId} className="ae-muted">{labels[item.status]??item.status}{item.materialized===false?' · 请求已接收，等待执行':''}</p>)}</div>}
   {run&&<div className="ae-conversation">{!session&&<div className="ae-user-message">{lastInput||'已恢复的执行'}</div>}<div className="ae-result"><div className="ae-result-heading"><strong>AE</strong><StatusIsland run={run} label={labels[run.status]??run.status}/></div>{run.message&&!conversationState.conversation?.messages.some(message=>message.runId===run.runId&&message.role==='assistant')&&<p>{run.message}</p>}
    {(run.status==='outcome-unknown'||run.status==='manual-review')&&<p className="ae-warning">尚不能确认操作结果。不要重新执行，先核对原操作记录。</p>}
    {approval&&<section className="ae-approval" aria-label="操作确认"><p className="ae-eyebrow">REVIEW BEFORE RUN</p><h3>请核对本次修改</h3><dl><div><dt>能力</dt><dd>{approval.binding.capabilityId}</dd></div><div><dt>目标</dt><dd>{approval.binding.targetId}</dd></div><div><dt>有效期</dt><dd>{new Date(approval.binding.expiresAt).toLocaleString('zh-CN')}</dd></div></dl><div className="ae-preview-grid" aria-label="修改预览">{Object.entries(approval.preview).map(([key,value])=><div key={key}><span>{key}</span><strong>{typeof value==='object'?inspect(value):String(value)}</strong></div>)}</div><details className="ae-technical"><summary>查看完整参数与绑定</summary><pre>{inspect({preview:approval.preview,expectedHash:approval.expectedHash,operationId:approval.binding.operationId})}</pre></details><p>仅批准当前参数与资源版本。服务端仍会重新验证权限。</p>{expired&&<p role="alert">确认已过期，请刷新状态。</p>}<div className="ae-actions"><button className="ae-primary" disabled={busy||expired} onClick={()=>perform(()=>client.decide(run.runId,{approvalId:approval.binding.approvalId,decision:'approve',expectedHash:approval.expectedHash}))}>确认并执行</button><button disabled={busy} onClick={()=>perform(()=>client.decide(run.runId,{approvalId:approval.binding.approvalId,decision:'reject',expectedHash:approval.expectedHash}))}>拒绝</button></div></section>}
    {run.receipts.map((receipt,i)=><article className="ae-receipt" key={i}><strong>{receipt.status==='succeeded'?'服务端执行回执':labels[receipt.status]??receipt.status}</strong><pre>{inspect(receipt)}</pre></article>)}
    <div className="ae-run-footer"><small>Run {run.runId}{run.releaseId&&<><br/>固定发布：{run.releaseId}</>}</small><button disabled={busy} onClick={()=>perform(()=>client.get(run.runId))}>刷新状态</button>{(active.has(run.status)||approval)&&<button disabled={busy} onClick={()=>perform(()=>client.cancel(run.runId))}>取消任务</button>}</div>
   </div></div>}
   {session&&conversationState.pending&&<aside className="ae-warning"><p>原请求尚未确认。刷新只核对原请求，不会创建新任务。</p>{conversationState.recoveryInputRequired&&<p>如需原样重试，请在下方重新输入原请求。只接受与原请求完全一致的内容，并沿用原请求标识。</p>}<button disabled={busy} onClick={()=>void session.refresh()}>核对原请求状态</button>{!conversationState.recoveryInputRequired&&<button disabled={busy||!connected} onClick={()=>void session.retry('')}>原样重试原请求</button>}</aside>}
   <AIInput value={input} onChange={setInput} contextLabel={contextLabel} busy={busy} disabled={session?(!connected||(!conversationState.pending&&!!unresolved)):(!!unresolved||!connected)} {...(session&&conversationState.pending?{submitLabel:'原样重试原请求'}:{})} onSubmit={()=>{const value=input.trim();if(!value||!connected)return;if(session){if(conversationState.pending)void session.retry(value);else if(!unresolved){void session.start(value);setInput('')}return;}if(unresolved)return;setLastInput(value);setPendingInput(value);void perform(()=>client.start(value,references));setInput('')}}/>
   {session&&!!conversationState.conversation?.runs.length&&<button disabled={!session.canStart()} onClick={()=>{setInput('');void session.newConversation()}}>新对话</button>}
  </div>;
 const errorContent=error&&<div className="ae-error" role="alert">{error}{session&&<button disabled={busy} onClick={()=>void session.refresh()}>刷新会话状态</button>}{!session&&pendingInput&&<button disabled={busy} onClick={()=>perform(()=>client.start(pendingInput,references))}>核对原请求状态</button>}</div>;
 return <><section className="ae-panel" aria-label="Agentic 工作区" hidden={!!floating&&!managementVisible}>
  <header className="ae-header"><div className="ae-brand" aria-hidden="true">ae<span>·</span></div><div><p className="ae-eyebrow">AGENTIC EVERYTHING</p><h2>{title}</h2></div><span className={`ae-connection ${connected?'is-connected':''}`}>{connected?'运行时已连接':'运行时未连接'}</span></header>
  <div className="ae-context"><span>当前上下文</span><strong>{contextLabel}</strong><span>权限由宿主服务端校验</span></div>
  {meta&&<div className="ae-mode">{meta.mode==='simulated'?'模拟模型 · 测试环境，不代表真实模型能力':'已连接模型提供方'}<span>Release {meta.releaseId}</span></div>}
  <Tabs.Root value={selectedTab} onValueChange={setSelectedTab} orientation="vertical" className="ae-tabs ae-management-tabs"><Tabs.List aria-label="Agentic 导航" className="ae-tab-list">{!floating&&<Tabs.Trigger value="assistant">助手</Tabs.Trigger>}<Tabs.Trigger value="capabilities">能力与权限</Tabs.Trigger><Tabs.Trigger value="activity">执行记录</Tabs.Trigger>{configurationClient&&<><Tabs.Trigger value="configuration">配置与发布</Tabs.Trigger><Tabs.Trigger value="behavior">行为改进</Tabs.Trigger></>}</Tabs.List>
  {!floating&&<Tabs.Content value="assistant" className="ae-tab-content">{assistantContent}</Tabs.Content>}
  <Tabs.Content value="capabilities" className="ae-tab-content"><h3>已登记的业务能力</h3><p className="ae-muted">这是服务端返回的能力清单，不是前端权限开关。</p>{capabilities.length===0&&<p>暂无可验证的能力信息。</p>}<div className="ae-capabilities">{capabilities.map(c=><article key={`${c.capabilityId}@${c.version}`}><div><strong>{c.capabilityId}</strong><span>{c.risk==='read'?'只读':'写入 · 需权限校验'}</span></div><p>{c.description}</p><small>版本 {c.version} · {c.approvalRequired?'需要确认':'服务端策略'} · {c.requiredScopes.join(', ')}</small></article>)}</div><aside className="ae-notice">能力由宿主服务端登记。配置与发布仅调整后续任务的允许范围，不授予业务权限。</aside></Tabs.Content>
  <Tabs.Content value="activity" className="ae-tab-content"><h3>服务端事件</h3><p className="ae-muted">只展示收到的事件，不生成模拟执行进度。</p>{!run&&<p>发送一个请求后，执行记录会出现在这里。</p>}<ol className="ae-events">{run?.events.map(e=><li key={e.eventId}><span>{e.sequence.toString().padStart(2,'0')}</span><div><strong>{e.type}</strong><time>{new Date(e.timestamp).toLocaleTimeString('zh-CN')}</time><pre>{inspect(e.payload)}</pre></div></li>)}</ol></Tabs.Content>
  {configurationClient&&<Tabs.Content value={selectedTab === 'behavior' ? 'behavior' : 'configuration'} className="ae-tab-content ae-configuration-tab"><ConfigurationPanel client={configurationClient} mode={selectedTab === 'behavior' ? 'behavior' : 'configuration'} onPublished={refreshConfiguration}/></Tabs.Content>}
  </Tabs.Root>{!floating&&errorContent}
 </section>{floating&&<FloatingAssistant {...floating}><div className="ae-context"><strong>{contextLabel}</strong><span>权限由宿主服务端校验</span></div>{meta&&<div className="ae-mode">{meta.mode==='simulated'?'模拟模型 · 测试环境':'已连接模型提供方'}</div>}<div className="ae-tab-content">{assistantContent}</div>{errorContent}</FloatingAssistant>}</>;
}
export const AgenticTab = AgenticPanel;
