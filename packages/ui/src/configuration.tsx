import React, { useEffect, useId, useRef, useState } from 'react';
import { AgentConfigurationSchema, type AgentConfiguration, type AgentDraft, type AgentRelease, type CapabilityVersion } from '@ae/contracts';
export interface ConfigurationState { durability: 'memory_fixture'; canConfigure: boolean; capabilities: CapabilityVersion[]; drafts: AgentDraft[]; releases: AgentRelease[]; activeReleaseId?: string }
export interface ConfigurationClient {
  state(): Promise<ConfigurationState>;
  save(configuration: AgentConfiguration, draft?: AgentDraft): Promise<AgentDraft>;
  validate(draft: AgentDraft): Promise<{valid: true; changes: string[]}>;
  publish(draft: AgentDraft): Promise<AgentRelease>;
}
export function createConfigurationClient(apiBase = '/api'): ConfigurationClient {
  const request = async <T,>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${apiBase}/configuration${path}`, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const value = await response.json() as T & {error?: {code?: string}};
    if (!response.ok) throw new Error(value.error?.code ?? `HTTP_${response.status}`); return value;
  };
  return { state: () => request('/'), save: (configuration, draft) => request('/drafts', { configuration, ...(draft ? {draftId: draft.draftId, expectedRevision: draft.revision} : {}) }), validate: draft => request(`/drafts/${encodeURIComponent(draft.draftId)}/validate`, {expectedRevision: draft.revision}), publish: draft => request(`/drafts/${encodeURIComponent(draft.draftId)}/publish`, {expectedRevision: draft.revision}) };
}
const initial: AgentConfiguration = {name: '应用助手', instructions: '帮助用户完成当前软件中的任务。仅使用获准能力，以宿主回执确认结果。', capabilityIds: [], bounds: {maxTurns: 8, maxElapsedMs: 120000}};
/** Same component and API for standalone console and native host Agentic tab. */
export function ConfigurationPanel({client}: {client: ConfigurationClient}) {
  const id = useId(), epoch = useRef(0), lock = useRef(false), errorRef = useRef<HTMLParagraphElement>(null);
  const [state,setState] = useState<ConfigurationState>(), [draft,setDraft] = useState<AgentDraft>(), [form,setForm] = useState<AgentConfiguration>(initial);
  const [busy,setBusy] = useState(true), [dirty,setDirty] = useState(true), [error,setError] = useState(''), [notice,setNotice] = useState(''), [changes,setChanges] = useState<string[]>();
  useEffect(() => { const current = ++epoch.current; setBusy(true); setState(undefined); setDraft(undefined); setForm(initial); setDirty(true); setChanges(undefined); setNotice(''); client.state().then(value => {if (epoch.current === current) {setState(value); setError('');}}, reason => {if(epoch.current === current)setError(String(reason instanceof Error ? reason.message : reason));}).finally(() => {if(epoch.current === current)setBusy(false);}); return () => {epoch.current++;}; },[client]);
  useEffect(() => { if (error) errorRef.current?.focus(); },[error]);
  const change = (value: AgentConfiguration) => {setForm(value); setDirty(true); setChanges(undefined); setNotice('');};
  const act = async (operation: () => Promise<void>) => {if(busy||lock.current)return; lock.current=true;setBusy(true);setError('');const current=epoch.current;try{await operation();}catch(reason){if(current===epoch.current)setError(reason instanceof Error?reason.message:String(reason));}finally{lock.current=false;if(current===epoch.current)setBusy(false);}};
  const save = () => act(async () => { const current = epoch.current; const parsed = AgentConfigurationSchema.safeParse(form);if(!parsed.success)throw new Error('请填写名称和指令，并检查运行上限。');const saved=await client.save(parsed.data,draft);if(current!==epoch.current)return;setDraft(saved);setForm(saved.configuration);setDirty(false);setChanges(undefined);setNotice('草稿已保存，尚未影响运行。');const next=await client.state();if(current===epoch.current)setState(next); });
  const validate = () => act(async()=>{if(!draft||dirty)return;const current=epoch.current;const result=await client.validate(draft);if(current!==epoch.current)return;setChanges(result.changes);setNotice('配置结构与已登记能力校验通过。不是模型质量或生产安全评测。');});
  const publish = () => act(async()=>{if(!draft||dirty||!changes)return;const current=epoch.current;const release=await client.publish(draft);if(current!==epoch.current)return;setNotice(`已发布 ${release.releaseId}。仅新任务使用新版本，现有任务保持原版本。`);setChanges(undefined);const next=await client.state();if(current===epoch.current)setState(next);});
  return <section className="ae-configuration" aria-labelledby={`${id}-heading`} aria-busy={busy}>
    <h2 id={`${id}-heading`}>Agentic 配置与发布</h2>
    <p>内存测试配置 · 进程重启会丢失 · 模型仍由子智能体模拟。配置权限不授予宿主业务权限。</p>
    {error&&<p ref={errorRef} tabIndex={-1} role="alert">{error}。若保存或发布结果不确定，请重新加载核对，勿重复创建。</p>}
    {notice&&<p role="status">{notice}</p>}
    <button disabled={busy} onClick={()=>void act(async()=>{const current=epoch.current;const next=await client.state();if(current!==epoch.current)return;setState(next);setNotice('已重新读取服务端配置与发布历史。');})}>重新加载配置</button>
    {state&&!state.canConfigure?<p>当前身份没有配置管理权限。请通过宿主管理员授权，页面不能自行提升权限。</p>:state&&<>
      <p>当前发布：{state.activeReleaseId??'尚未发布'}</p>
      <label htmlFor={`${id}-draft`}>草稿</label><select id={`${id}-draft`} disabled={busy} value={draft?.draftId??''} onChange={event=>{const selected=state.drafts.find(d=>d.draftId===event.target.value);setDraft(selected);setForm(selected?.configuration??initial);setDirty(!selected);setChanges(undefined);setNotice('');}}><option value="">新建草稿</option>{state.drafts.map(d=><option key={d.draftId} value={d.draftId}>{d.configuration.name} · r{d.revision}</option>)}</select>
      <form onSubmit={event=>{event.preventDefault();void save();}}>
        <fieldset disabled={busy}><legend>助手配置</legend>
          <label htmlFor={`${id}-name`}>名称</label><input id={`${id}-name`} required maxLength={80} value={form.name} onChange={event=>change({...form,name:event.target.value})}/>
          <label htmlFor={`${id}-instructions`}>指令</label><textarea id={`${id}-instructions`} required maxLength={8000} value={form.instructions} onChange={event=>change({...form,instructions:event.target.value})}/>
          <fieldset><legend>已登记能力</legend>{state.capabilities.map(capability=><label key={capability.capabilityId}><input type="checkbox" checked={form.capabilityIds.includes(capability.capabilityId)} onChange={event=>change({...form,capabilityIds:event.target.checked?[...form.capabilityIds,capability.capabilityId]:form.capabilityIds.filter(id=>id!==capability.capabilityId)})}/>{capability.capabilityId} · {capability.risk} · v{capability.version}{capability.approvalRequired?' · 必须审批':''}</label>)}</fieldset>
          <label htmlFor={`${id}-turns`}>最大轮数（1–16）</label><input id={`${id}-turns`} type="number" min={1} max={16} required value={form.bounds.maxTurns} onChange={event=>change({...form,bounds:{...form.bounds,maxTurns:Number(event.target.value)}})}/>
          <label htmlFor={`${id}-elapsed`}>单次执行时限（毫秒，1000–240000）</label><input id={`${id}-elapsed`} type="number" min={1000} max={240000} required value={form.bounds.maxElapsedMs} onChange={event=>change({...form,bounds:{...form.bounds,maxElapsedMs:Number(event.target.value)}})}/>
          <button type="submit">保存草稿</button>
        </fieldset>
      </form>
      <button disabled={busy||!draft||dirty} onClick={()=>void validate()}>校验与查看变更</button>
      {changes&&<div aria-label="发布变更"><p>相对当前发布的变化：</p><ul>{changes.length?changes.map((change,i)=><li key={i}>{change}</li>):<li>配置无变化</li>}</ul><p>发布不会授予业务权限；写操作仍必须审批。</p></div>}
      <button disabled={busy||!draft||dirty||!changes} onClick={()=>void publish()}>发布不可变版本</button>
      <h3>发布历史</h3><ol>{[...state.releases].reverse().map(release=><li key={release.releaseId}>{release.configuration.name} · 草稿 r{release.draftRevision} · {release.publishedAt}<br/><small>{release.releaseId}</small><br/>能力：{release.configuration.capabilityIds.join(', ')||'无'} · {release.configuration.bounds.maxTurns} 轮</li>)}</ol>
    </>}
  </section>;
}
