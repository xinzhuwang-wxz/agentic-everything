import { readFileSync } from 'node:fs';
import type { BehaviorCase, Improvement, Provenance } from '@ae/contracts';
import { contentHash } from '@ae/contracts/hash';
import type { PublicBehaviorAdapter } from '@ae/verification';

// Deliberately synthetic. Not a discovered customer defect or production adapter.
export const provenance: Provenance = { sourceVersion: 'synthetic-legacy-v1', codeHash: contentHash(readFileSync('tests/differential/synthetic.ts', 'utf8')), environment: `Node ${process.version} isolated in-memory fixture`, environmentHash: contentHash({ node: process.version, platform: process.platform, arch: process.arch }), dataHash: contentHash(['a', 'b', 'c']), schemaVersion: 'synthetic-pagination-v1', adapterVersion: 'fixture-adapter-v1' };
export const candidate: Provenance = { ...provenance, sourceVersion: 'synthetic-agentic-v1', codeHash: provenance.codeHash };
export const cases: BehaviorCase[] = [
  { id: 'first-page', input: { offset: 0, limit: 2 }, seed: ['a', 'b', 'c'], covers: ['page has successor'] },
  { id: 'exact-end', input: { offset: 1, limit: 2 }, seed: ['a', 'b', 'c'], covers: ['exact final page boundary'] },
  { id: 'beyond-end', input: { offset: 3, limit: 2 }, seed: ['a', 'b', 'c'], covers: ['empty page beyond end'] },
];
export const improvement: Improvement = { id: 'pagination-final-page', version: '1', category: 'business-behavior', reason: 'Synthetic legacy >= comparison reports a successor at exact end', evidence: ['Synthetic exact-end case'], impact: 'Only final-page hasMore becomes false', defaultEnabled: false, reversibility: 'Disable the version-bound switch to restore synthetic legacy behavior', expectedAllowedDiff: [{ caseId: 'exact-end', path: ['output', 'hasMore'], before: true, after: false }] };
export function fixture(options: { clock?: string; forceFix?: boolean; regress?: boolean; extraEffect?: boolean } = {}): PublicBehaviorAdapter {
  return { safety: 'isolated-seeded-fixture', async execute(test, flags) {
    // Each execution creates its own data; no shared database or external transport.
    const rows = [...test.seed as string[]]; const { offset, limit } = test.input as { offset: number; limit: number };
    const fixed = options.forceFix || flags['pagination-final-page'];
    return { output: { rows: rows.slice(offset, offset + limit), hasMore: options.regress ? true : fixed ? rows.length > offset + limit : rows.length >= offset + limit }, sideEffects: options.extraEffect ? [{ kind: 'unexpected-write' }] : [], receipt: { operation: 'list', timestamp: options.clock ?? 'synthetic-clock-before' } };
  } };
}
