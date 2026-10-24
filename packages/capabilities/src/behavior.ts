import { BaselineArchiveSchema, type BaselineArchive, type BehaviorCatalog, type BehaviorSelection, type Improvement, type Observation } from '@ae/contracts';
import { digest, PolicyError } from '@ae/policy';
import { checkedBehaviorCatalog, validateBehaviorSelection } from '@ae/control-plane';
import type { Ticket } from './index.js';

/** Synthetic business display rule only. Does not rewrite stored titles or change authorization. */
function correctedTitle(title: string): string { return title.trim(); }
const sample: Ticket = {id:'synthetic-title',tenantId:'tenant-a',title:'  Printer offline  ',priority:'low',version:1};
const unchanged: Ticket = {...sample,id:'synthetic-clean',title:'Printer offline'};
const observe = (ticket: Ticket): Observation => ({output:{...ticket},sideEffects:[],receipt:{kind:'read-only'}});
const cases = [sample,unchanged].map(ticket => {
  const test = {id:ticket.id,input:{ticketId:ticket.id},seed:{...ticket},covers:['title-display','unchanged-priority','unchanged-version','no-write']};
  const observation = observe(ticket);
  return {test,observation,hash:digest({test,observation})};
});
const manifest = {
  schemaVersion:'1' as const,capturedAt:'2026-10-24T00:00:00.000Z',
  provenance:{sourceVersion:'synthetic-title-legacy-v1',codeHash:digest('return unchanged host ticket'),environment:'isolated synthetic fixture',environmentHash:digest('synthetic-title-environment-v1'),dataHash:digest([sample,unchanged]),schemaVersion:'1',adapterVersion:'1'},
  safety:'isolated-seeded-fixture' as const,normalization:[],coverage:{scope:'Two synthetic title reads only; original external cases deferred',unknowns:['Not evidence for real customer defects, writes, other inputs, or model quality.']},cases,
};
/** Fixed synthetic baseline, reproducible hashes, no production data or auto-discovered corrections. */
export const syntheticTitleBaseline: BaselineArchive = BaselineArchiveSchema.parse({manifest,hash:digest(manifest)});
const improvement: Improvement = {
  id:'synthetic-ticket-title-trim',version:'1',category:'business-behavior',reason:'Synthetic imported titles retain surrounding whitespace in display.',
  evidence:['synthetic-title baseline case; exact output/title delta only'],impact:'Only the returned title display loses surrounding whitespace. Stored data, permissions, priority and resource version are unchanged.',
  defaultEnabled:false,reversibility:'Turning OFF affects subsequent reads/new runs only. It does not undo historical side effects or change existing run snapshots.',
  expectedAllowedDiff:[{caseId:'synthetic-title',path:['output','title'],before:sample.title,after:correctedTitle(sample.title)}],
};
const deepFreeze = <T>(value: T): T => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
export const syntheticTitleCatalog: BehaviorCatalog = deepFreeze(checkedBehaviorCatalog({
  baselineHash:syntheticTitleBaseline.hash,
  // Binds the actual executable rule body; this is not an entire repository source attestation.
  candidateCodeHash:digest(correctedTitle.toString()),registryHash:digest([improvement]),
  improvements:[{...improvement,risk:'Low, read-only display change; whitespace may be intentional. Synthetic example only.',examples:{before:JSON.stringify(sample.title),after:JSON.stringify(correctedTitle(sample.title))}}],
})!);
/** Shared host business projection for ordinary pages and assistants; caller passes a trusted release snapshot. */
export function projectTicketBehavior(ticket: Ticket, selection?: BehaviorSelection): Ticket {
  validateBehaviorSelection(selection,syntheticTitleCatalog);
  const result=structuredClone(ticket);
  if(selection?.enabled.some(item=>item.id===improvement.id&&item.version===improvement.version)) result.title=correctedTitle(result.title);
  return result;
}
/** Host adapter supports only this explicitly installed business implementation, not arbitrary registry flags. */
export function assertTicketBehavior(selection?: BehaviorSelection): void {
  try { validateBehaviorSelection(selection,syntheticTitleCatalog); } catch { throw new PolicyError('HOST_BEHAVIOR_VERSION_DENIED'); }
}
