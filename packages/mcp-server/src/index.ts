import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ConfigurationStepSchema, PatchArtifactSchema, Sha256 } from '@ae/contracts';
import { ConfigurationPreflight, type ConfigurationOptions, assessProject, proposePlan, previewPatch, verifyAdaptation, digest } from '@ae/transformation';

const recipeId = 'react-helpdesk';
const recipePaths = ['src/App.tsx', 'src/ae/AgenticMount.tsx'];
const recipeInput = z.strictObject({ recipeId: z.literal(recipeId) });
const verificationInput = z.strictObject({
  patch: PatchArtifactSchema.omit({ worktree: true }).extend({
    changes: PatchArtifactSchema.shape.changes.max(2),
  }),
  businessHash: Sha256,
});
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** Launch configuration, not model tool arguments. Only explicitly authorized development repos. */
export interface McpLaunchScope { allowedRepoRoot: string; configuration?: ConfigurationOptions; configurationMode?: 'self_hosted' | 'hosted'; }
function boundedRoot(input: string): string {
  if (!isAbsolute(input) || input !== resolve(input) || input === parse(input).root) throw new Error('Configure an exact absolute development repository root');
  const actual = realpathSync(input);
  if (actual !== input || !lstatSync(input).isDirectory()) throw new Error('Repository root must be a canonical directory without symlink aliases');
  // Reject symlink ancestors even when a platform happens to normalize their spelling.
  let current = parse(input).root;
  for (const segment of relative(current, input).split(sep)) {
    current = resolve(current, segment);
    if (lstatSync(current).isSymbolicLink()) throw new Error('Symlink root ancestry is not permitted');
  }
  return actual;
}
function result(value: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }; }
function guarded(work: () => unknown) {
  try { return result(work()); }
  catch { return { isError: true, ...result({ error: 'AE_READ_ONLY_OPERATION_REJECTED', message: 'Input, repository state, recipe support, or bounded source validation failed. No source was executed or changed.' }) }; }
}
export function createAeMcpServer(scope: McpLaunchScope): McpServer {
  const root = boundedRoot(scope.allowedRepoRoot);
  // Establish exact Git-root validity before accepting any MCP request.
  assessProject(root);
  const checkRoot = () => { if (boundedRoot(scope.allowedRepoRoot) !== root) throw new Error('Repository scope changed'); };
  const server = new McpServer({ name: 'agentic-everything', version: '0.1.0' });
  const configuration = new ConfigurationPreflight(scope.configuration);
  server.registerTool('ae_preflight', {
    description: 'Check required configuration without reading or returning secrets. Recheck the same taskId after operator configuration. Read-only steps never require a provider key.',
    inputSchema: z.strictObject({ taskId: z.uuid(), step: ConfigurationStepSchema }), annotations,
  }, async ({ taskId, step }) => result(await configuration.check({ taskId, step, mode: scope.configurationMode ?? 'self_hosted' })));
  server.registerTool('ae_describe', {
    description: 'Describe AE source-to-agentic adaptation capabilities and limits. Your existing developer agent remains the coding execution owner.',
    inputSchema: z.strictObject({}), annotations,
  }, () => result({
    mode: 'read-only', scope: 'One operator-configured development Git repository; client roots never grant access.',
    recipes: [{ id: recipeId, version: '1.0.0', support: 'Qualified first sample: React 19 helpdesk layout, not a product or industry boundary.' }],
    generality: 'AE is for software of all kinds. Unknown layouts require evidence-led custom adaptation by the existing developer agent; no automatic patch is claimed.',
    limitations: ['No shell, arbitrary file reads, source execution, network access, or paid model calls.', 'No approval, apply, or revert tools. MCP arguments cannot create authority.', 'Verification is static and hash-based. Host tests, identity, runtime, and browser acceptance remain not-run.', 'Use the Skill/CLI workflow with separately authorized plan approval and isolated apply.'],
  }));
  server.registerTool('ae_assess', {
    description: 'Read bounded recipe source evidence from the launch-configured repository. Unsupported layouts remain assessment-only, not rejected as product categories.',
    inputSchema: z.strictObject({}), annotations,
  }, () => guarded(() => { checkRoot(); return assessProject(root); }));
  server.registerTool('ae_plan', {
    description: 'Propose a plan from freshly assessed source using the shared transformation core. A proposal is not an approval.',
    inputSchema: recipeInput, annotations,
  }, () => guarded(() => { checkRoot(); const assessment = assessProject(root); const plan = proposePlan(assessment); return { assessment, plan, planHash: digest(plan) }; }));
  server.registerTool('ae_preview', {
    description: 'Preview the shared recipe patch without writing. Requires the current ae_plan hash; source drift invalidates the preview.',
    inputSchema: recipeInput.extend({ planHash: Sha256 }), annotations,
  }, ({ planHash }) => guarded(() => {
    checkRoot(); const assessment = assessProject(root); const plan = proposePlan(assessment);
    if (digest(plan) !== planHash) throw new Error('Plan drift');
    return { planHash, changes: previewPatch(root, plan, assessment) };
  }));
  server.registerTool('ae_verify', {
    description: 'Statically compare supplied patch hashes against the configured repository only. Hash expectations are caller claims, not approval or authenticated provenance. No tests or customer code run.',
    inputSchema: verificationInput, annotations,
  }, ({ patch, businessHash }) => guarded(() => {
    checkRoot();
    if (patch.recipe.id !== recipeId || patch.recipe.version !== '1.0.0' || JSON.stringify(patch.changes.map(c => c.path)) !== JSON.stringify(recipePaths)) throw new Error('Unknown verification recipe or path scope');
    return verifyAdaptation({ patch: { ...patch, worktree: root }, businessHash, originals: {} });
  }));
  return server;
}
