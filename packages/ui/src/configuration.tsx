import React, { useEffect, useId, useRef, useState } from 'react';
import { AgentConfigurationSchema, type AgentConfiguration, type AgentDraft, type AgentRelease, type CapabilityVersion, type BehaviorCatalog } from '@ae/contracts';
export interface ConfigurationState { durability: 'memory_fixture' | 'postgres_qualified'; canConfigure: boolean; capabilities: CapabilityVersion[]; drafts: AgentDraft[]; releases: AgentRelease[]; activeReleaseId?: string; behaviorCatalog?: BehaviorCatalog }
export interface ConfigurationClient {
  state(): Promise<ConfigurationState>;
  save(configuration: AgentConfiguration, draft?: AgentDraft): Promise<AgentDraft>;
  validate(draft: AgentDraft): Promise<{valid: true; changes: string[]}>;
  publish(draft: AgentDraft): Promise<AgentRelease>;
}
export class ConfigurationRequestError extends Error { constructor(public readonly status:number, public readonly code:string, message:string){super(message);this.name='ConfigurationRequestError';} }
export function createConfigurationClient(apiBase = '/api'): ConfigurationClient {
  const request = async <T,>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${apiBase}/configuration${path}`, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const value = await response.json() as T & {error?: {code?: string; message?:string}};
    if (!response.ok) throw new ConfigurationRequestError(response.status,value.error?.code??`HTTP_${response.status}`,value.error?.message??value.error?.code??`HTTP_${response.status}`); return value;
  };
  return { state: () => request(''), save: (configuration, draft) => request('/drafts', { configuration, ...(draft ? {draftId: draft.draftId, expectedRevision: draft.revision} : {}) }), validate: draft => request(`/drafts/${encodeURIComponent(draft.draftId)}/validate`, {expectedRevision: draft.revision}), publish: draft => request(`/drafts/${encodeURIComponent(draft.draftId)}/publish`, {expectedRevision: draft.revision}) };
}
const initial: AgentConfiguration = {name: '应用助手', instructions: '帮助用户完成当前软件中的任务。仅使用获准能力，以宿主回执确认结果。', capabilityIds: [], bounds: {maxTurns: 8, maxElapsedMs: 120000}};
const activeConfiguration = (state: ConfigurationState) => state.releases.find(release => release.releaseId === state.activeReleaseId)?.configuration ?? initial;
/** Same component and API for standalone console and native host Agentic tab. */
export function ConfigurationPanel({client,onPublished,mode = 'configuration'}: {client: ConfigurationClient; onPublished?:()=>void|Promise<void>; mode?: 'configuration' | 'behavior'}) {
  const id = useId(), epoch = useRef(0), lock = useRef(false), errorRef = useRef<HTMLParagraphElement>(null);
  const [state,setState] = useState<ConfigurationState>(), [draft,setDraft] = useState<AgentDraft>(), [form,setForm] = useState<AgentConfiguration>(initial);
  const [busy,setBusy] = useState(true), [dirty,setDirty] = useState(true), [error,setError] = useState(''), [notice,setNotice] = useState(''), [changes,setChanges] = useState<string[]>();
  useEffect(() => { const current = ++epoch.current; lock.current=false; setBusy(true); setState(undefined); setDraft(undefined); setForm(initial); setDirty(true); setChanges(undefined); setNotice(''); setError(''); client.state().then(value => {if (epoch.current === current) {setState(value); setForm(activeConfiguration(value)); setError('');}}, reason => {if(epoch.current === current)setError(String(reason instanceof Error ? reason.message : reason));}).finally(() => {if(epoch.current === current)setBusy(false);}); return () => {epoch.current++;}; },[client]);
  useEffect(() => { if (error) errorRef.current?.focus(); },[error]);
  const change = (value: AgentConfiguration) => {setForm(value); setDirty(true); setChanges(undefined); setNotice('');};
  const act = async (operation: () => Promise<void>) => {if(busy||lock.current)return; lock.current=true;setBusy(true);setError('');const current=epoch.current;try{await operation();}catch(reason){if(current===epoch.current){const message=reason instanceof Error?reason.message:String(reason);setError(message);if((reason instanceof ConfigurationRequestError&&[401,403].includes(reason.status))||/DENIED|AUTHENTICATION_REQUIRED|HTTP_40[13]/.test(message)){setState(undefined);setDraft(undefined);setForm(initial);setDirty(true);setChanges(undefined);setNotice('');}}}finally{if(current===epoch.current){lock.current=false;setBusy(false);}}};
  const save = () => act(async () => { const current = epoch.current; const parsed = AgentConfigurationSchema.safeParse(form);if(!parsed.success)throw new Error('请填写名称和指令，并检查运行上限。');const saved=await client.save(parsed.data,draft);if(current!==epoch.current)return;setDraft(saved);setForm(saved.configuration);setDirty(false);setChanges(undefined);setNotice('草稿已保存，尚未影响运行。');const next=await client.state();if(current===epoch.current)setState(next); });
  const validate = () => act(async()=>{if(!draft||dirty)return;const current=epoch.current;const result=await client.validate(draft);if(current!==epoch.current)return;setChanges(result.changes);setNotice('配置结构与已登记能力校验通过。不是模型质量或生产安全评测。');});
  const publish = () => act(async()=>{if(!draft||dirty||!changes)return;const current=epoch.current;const release=await client.publish(draft);if(current!==epoch.current)return;setNotice(`已发布 ${release.releaseId}。普通页面后续读取使用当前发布，已启动任务固定原版本。`);setChanges(undefined);await onPublished?.();if(current!==epoch.current)return;const next=await client.state();if(current===epoch.current)setState(next);});
  return <section className="ae-configuration" aria-labelledby={`${id}-heading`} aria-busy={busy}>
    <div className="ae-config-heading"><p className="ae-eyebrow">CONFIGURE · VALIDATE · RELEASE</p><h2 id={`${id}-heading`}>{mode === 'behavior' ? '行为改进' : '配置你的应用助手'}</h2></div>
    <p className="ae-config-environment">{state?.durability === 'postgres_qualified' ? '配置已持久化到 PostgreSQL。' : state?.durability === 'memory_fixture' ? '内存测试配置 · 进程重启会丢失。' : '正在读取配置存储状态。'}配置权限不授予宿主业务权限；存储状态不代表模型或生产环境已经验收。</p>
    {error&&<p className="ae-config-error" ref={errorRef} tabIndex={-1} role="alert">{error}。若保存或发布结果不确定，请重新加载核对，勿重复创建。</p>}
    {notice&&<p className="ae-config-notice" role="status">{notice}</p>}
    <button disabled={busy} onClick={()=>void act(async()=>{const current=epoch.current;const next=await client.state();if(current!==epoch.current)return;setState(next);setNotice('已重新读取服务端配置与发布历史。');})}>重新加载配置</button>
    {state&&!state.canConfigure?<p className="ae-config-readonly">当前身份没有配置管理权限。请通过宿主管理员授权，页面不能自行提升权限。</p>:state&&<>
      <div className="ae-config-release"><span>当前生效版本</span><strong>{state.activeReleaseId??'尚未发布'}</strong><small>普通页面后续读取使用当前发布，已启动任务固定原版本</small></div>
      <label htmlFor={`${id}-draft`}>草稿</label><select id={`${id}-draft`} disabled={busy} value={draft?.draftId??''} onChange={event=>{const selected=state.drafts.find(d=>d.draftId===event.target.value);setDraft(selected);setForm(selected?.configuration??activeConfiguration(state));setDirty(!selected);setChanges(undefined);setNotice('');}}><option value="">从当前生效版本新建草稿</option>{state.drafts.map(d=><option key={d.draftId} value={d.draftId}>{d.configuration.name} · r{d.revision}</option>)}</select>
      <form onSubmit={event=>{event.preventDefault();void save();}}>
        <fieldset className="ae-config-fields" disabled={busy}><legend>{mode === 'behavior' ? '01 / 集中审阅业务行为' : '01 / 助手定义'}</legend>
          {mode === 'behavior' ? <>
            <p>所有改进默认关闭。逐项选择保留旧行为或采用修正，然后保存、校验并发布同一份助手配置。</p>
            <aside className="ae-notice">安全、权限和数据完整性问题不能作为兼容性开关。关闭改进影响后续页面读取与新任务，不撤销历史写入或其他已发生的副作用。</aside>
            {!state.behaviorCatalog ? <p className="ae-config-readonly">当前服务端未提供可审阅的行为改进目录。现有配置会原样保留。</p> : <>
              <dl className="ae-behavior-hashes"><dt>基线哈希</dt><dd>{state.behaviorCatalog.baselineHash}</dd><dt>候选代码哈希</dt><dd>{state.behaviorCatalog.candidateCodeHash}</dd><dt>登记表哈希</dt><dd>{state.behaviorCatalog.registryHash}</dd></dl>
              {form.behavior && (form.behavior.baselineHash !== state.behaviorCatalog.baselineHash || form.behavior.candidateCodeHash !== state.behaviorCatalog.candidateCodeHash || form.behavior.registryHash !== state.behaviorCatalog.registryHash) ? <p role="alert" className="ae-config-error">当前配置绑定的证据版本与目录不同，不能自动迁移选择。请先核对服务端目录与配置。</p> : state.behaviorCatalog.improvements.filter(item => item.category === 'business-behavior').map(item => {
                const enabled = form.behavior?.enabled.some(selection => selection.id === item.id && selection.version === item.version) ?? false;
                const choose = (adopt: boolean) => {
                  const catalog = state.behaviorCatalog!;
                  const selected = (form.behavior?.enabled ?? []).filter(selection => selection.id !== item.id);
                  change({...form, behavior: {baselineHash: catalog.baselineHash, candidateCodeHash: catalog.candidateCodeHash, registryHash: catalog.registryHash, enabled: adopt ? [...selected, {id: item.id, version: item.version}] : selected}});
                };
                return <article className="ae-behavior-item" key={`${item.id}@${item.version}`}>
                  <h3>{item.id} <small>v{item.version} · {enabled ? '采用修正' : '保留旧行为（OFF）'}</small></h3>
                  <dl><dt>原因</dt><dd>{item.reason}</dd><dt>证据</dt><dd><ul>{item.evidence.map((evidence,index) => <li key={index}>{evidence}</li>)}</ul></dd><dt>影响</dt><dd>{item.impact}</dd><dt>风险</dt><dd>{item.risk}</dd><dt>可逆性</dt><dd>{item.reversibility}</dd></dl>
                  <div className="ae-behavior-examples"><div><strong>修正前</strong><p>{item.examples.before}</p></div><div><strong>修正后</strong><p>{item.examples.after}</p></div></div>
                  <details><summary>查看精确允许差异（{item.expectedAllowedDiff.length}）</summary>{item.expectedAllowedDiff.map((diff,index) => <div className="ae-behavior-delta" key={index}><strong>用例 {diff.caseId}</strong><pre>{JSON.stringify({path: diff.path, before: diff.before, after: diff.after}, null, 2)}</pre></div>)}</details>
                  <fieldset className="ae-behavior-choice"><legend>{item.id} 的行为选择 · 默认 OFF</legend><label><input type="radio" name={`${id}-${item.id}`} checked={!enabled} onChange={() => choose(false)}/>保留旧行为</label><label><input type="radio" name={`${id}-${item.id}`} checked={enabled} onChange={() => choose(true)}/>采用修正</label></fieldset>
                </article>;
              })}
              {state.behaviorCatalog.improvements.length === 0 && <p>当前没有登记的业务行为改进。</p>}
            </>}
          </> : <>

          <label htmlFor={`${id}-name`}>名称</label><input id={`${id}-name`} required maxLength={80} value={form.name} onChange={event=>change({...form,name:event.target.value})}/>
          <label htmlFor={`${id}-instructions`}>指令</label><textarea id={`${id}-instructions`} required maxLength={8000} value={form.instructions} onChange={event=>change({...form,instructions:event.target.value})}/>
          <fieldset className="ae-config-capabilities"><legend>02 / 允许使用的已登记能力</legend><p>勾选只缩小本助手的范围，不替代宿主业务授权。</p>{state.capabilities.map(capability=><label key={capability.capabilityId}><input type="checkbox" checked={form.capabilityIds.includes(capability.capabilityId)} onChange={event=>change({...form,capabilityIds:event.target.checked?[...form.capabilityIds,capability.capabilityId]:form.capabilityIds.filter(id=>id!==capability.capabilityId)})}/><span><strong>{capability.capabilityId}</strong><small>{capability.description}</small><em>{capability.risk} · v{capability.version}{capability.approvalRequired?' · 必须审批':''}</em></span></label>)}</fieldset>
          <div className="ae-config-bounds"><h3>03 / 运行边界</h3><label htmlFor={`${id}-turns`}>最大轮数（1–16）</label><input id={`${id}-turns`} type="number" min={1} max={16} required value={form.bounds.maxTurns} onChange={event=>change({...form,bounds:{...form.bounds,maxTurns:Number(event.target.value)}})}/>
          <label htmlFor={`${id}-elapsed`}>单次执行时限（毫秒，1000–240000）</label><input id={`${id}-elapsed`} type="number" min={1000} max={240000} required value={form.bounds.maxElapsedMs} onChange={event=>change({...form,bounds:{...form.bounds,maxElapsedMs:Number(event.target.value)}})}/>
          </div></>}<button className="ae-primary" type="submit">保存草稿</button>
        </fieldset>
      </form>
      <div className="ae-config-publish"><h3>04 / 校验与发布</h3><p>保存草稿 → 查看服务端变更 → 发布不可变版本</p><button disabled={busy||!draft||dirty} onClick={()=>void validate()}>校验与查看变更</button>
      {changes&&<div className="ae-config-diff" aria-label="发布变更"><p>相对当前发布的变化：</p><ul>{changes.length?changes.map((change,i)=><li key={i}>{change}</li>):<li>配置无变化</li>}</ul><p>发布不会授予业务权限；写操作仍必须审批。</p></div>}
      <button className="ae-primary" disabled={busy||!draft||dirty||!changes} onClick={()=>void publish()}>发布不可变版本</button></div>
      <div className="ae-config-history"><h3>发布历史</h3>{state.releases.length===0&&<p>尚无发布。保存与校验草稿不会改变正在运行的任务。</p>}<ol>{[...state.releases].reverse().map(release=><li key={release.releaseId}>{release.configuration.name} · 草稿 r{release.draftRevision} · {release.publishedAt}<br/><small>{release.releaseId}</small><br/>能力：{release.configuration.capabilityIds.join(', ')||'无'} · {release.configuration.bounds.maxTurns} 轮<br/>发布者：{release.publishedBy}<br/>行为改进：{release.configuration.behavior?.enabled.map(item => `${item.id}@${item.version}`).join(', ') || 'OFF（保留旧行为）'}{release.configuration.behavior && <details><summary>查看本次发布的行为证据绑定</summary><dl className="ae-behavior-hashes"><dt>基线哈希</dt><dd>{release.configuration.behavior.baselineHash}</dd><dt>候选代码哈希</dt><dd>{release.configuration.behavior.candidateCodeHash}</dd><dt>登记表哈希</dt><dd>{release.configuration.behavior.registryHash}</dd></dl></details>}</li>)}</ol></div>
    </>}
  </section>;
}
