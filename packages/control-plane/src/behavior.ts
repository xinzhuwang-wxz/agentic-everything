import { BehaviorCatalogSchema, BehaviorSelectionSchema, ImprovementSchema, type BehaviorCatalog, type BehaviorSelection } from '@ae/contracts';
import { digest, PolicyError } from '@ae/policy';
/** Registry bytes use the same strict Improvement schema and digest as compareBaseline. */
export function checkedBehaviorCatalog(input?: BehaviorCatalog): BehaviorCatalog | undefined {
  if (!input) return undefined;
  const parsed = BehaviorCatalogSchema.safeParse(input);
  if (!parsed.success) throw new PolicyError('INVALID_BEHAVIOR_CATALOG');
  const catalog = parsed.data;
  const registry = catalog.improvements.map(({risk: _risk, examples: _examples, ...item}) => ImprovementSchema.parse(item));
  if (digest(registry) !== catalog.registryHash) throw new PolicyError('BEHAVIOR_REGISTRY_HASH_DENIED');
  return structuredClone(catalog);
}
export function validateBehaviorSelection(input: BehaviorSelection | undefined, catalog?: BehaviorCatalog): void {
  if (!input) return; // Old releases retain the original behavior.
  const parsed = BehaviorSelectionSchema.safeParse(input);
  if (!parsed.success || !catalog) throw new PolicyError('BEHAVIOR_SELECTION_DENIED');
  const value = parsed.data;
  for (const key of ['baselineHash','candidateCodeHash','registryHash'] as const) if (value[key] !== catalog[key]) throw new PolicyError('BEHAVIOR_VERSION_DENIED');
  for (const item of value.enabled) if (!catalog.improvements.some(i => i.id === item.id && i.version === item.version)) throw new PolicyError('UNREGISTERED_BEHAVIOR_DENIED');
  const paths = value.enabled.flatMap(item => catalog.improvements.find(i => i.id === item.id)!.expectedAllowedDiff.map(d => JSON.stringify([d.caseId,d.path])));
  if (new Set(paths).size !== paths.length) throw new PolicyError('BEHAVIOR_DIFF_OVERLAP_DENIED');
}
