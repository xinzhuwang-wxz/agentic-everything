/** Host-owned references only, never record contents, identity, credentials or permissions. */
export type AeReferenceContext = Readonly<Record<string, string>>;
/** Structural compatibility for hosts that previously passed the ticket fixture context. */
export interface LegacyTicketContext { ticketId: string }
export type AeContext = AeReferenceContext | LegacyTicketContext;
export interface AeSuggestion { label: string; input: string }

const authorityFields = new Set(['principal', 'tenantid', 'applicationid', 'subjectid', 'roles', 'scopes', 'approval', 'approvalauthority']);
const secretFields = /(?:password|secret|token|credential|authorization|cookie|apikey)/i;
/** Snapshot and validate the narrow browser reference seam. This never grants authority. */
export function normalizeReferenceContext(context: AeContext): Record<string, string> {
  if (!context || typeof context !== 'object' || Array.isArray(context) || ![Object.prototype, null].includes(Object.getPrototypeOf(context))) throw new Error('Host context must be a plain reference map');
  const entries = Object.entries(context).filter(([key]) => !authorityFields.has(key.toLowerCase()));
  if (entries.length > 16) throw new Error('Host context permits at most 16 references');
  const result: Record<string, string> = {};
  for (const [key, value] of entries.sort(([a], [b]) => a<b?-1:a>b?1:0)) {
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(key) || secretFields.test(key) || typeof value !== 'string' || !/^[^\s\u0000-\u001f\u007f]{1,200}$/u.test(value)) throw new Error('Host context must contain bounded reference identifiers, not business payloads or secrets');
    Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
  }
  if (JSON.stringify(result).length > 4096) throw new Error('Host context reference exceeds 4096 characters');
  return result;
}
export function referenceContextKey(context: AeContext): string { return JSON.stringify(normalizeReferenceContext(context)); }
export const genericSuggestions: readonly AeSuggestion[] = [
  { label: '理解当前上下文', input: '读取当前上下文中可访问的信息' },
  { label: '查看可用操作', input: '说明当前上下文中可用的操作和权限边界' },
];
export const ticketSuggestions: readonly AeSuggestion[] = [
  { label: '读取当前工单', input: '读取当前工单' },
  { label: '预览优先级调整', input: '将当前工单优先级改为 high' },
];
