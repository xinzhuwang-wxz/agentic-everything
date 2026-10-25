import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { PatchArtifactSchema, Sha256 } from '@ae/contracts';
import { assessProject, proposePlan, previewPatch, verifyAdaptation, installedRecipeDescriptors, digest } from '@ae/transformation';

export { createAuthenticatedHostMcp, createOriginBoundMcpFetch } from './remote.js';

const recipes = installedRecipeDescriptors();
if (!recipes.length) throw new Error('No MCP recipes are installed');
const recipeInput = z.strictObject({ recipeId: z.enum(recipes.map(recipe => recipe.ref.id) as [string, ...string[]]) });
const verificationInput = z.strictObject({
  patch: PatchArtifactSchema.omit({ worktree: true }).extend({
    changes: PatchArtifactSchema.shape.changes.max(Math.max(...recipes.map(recipe => recipe.outputPaths.length))),
  }),
  businessHash: Sha256,
});
function plannedRecipe(root: string, requestedId: string) {
  const assessment = assessProject(root), plan = proposePlan(assessment);
  const installed = recipes.find(recipe => recipe.ref.id === requestedId);
  if (!installed || plan.recipes.length !== 1 || digest(plan.recipes[0]) !== digest(installed.ref)) throw new Error('Requested recipe does not match this host');
  return { assessment, plan, planHash: digest(plan) };
}
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** Launch configuration, not model tool arguments. Only explicitly authorized development repos. */
export interface McpLaunchScope { allowedRepoRoot: string; }
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
  server.registerTool('ae_describe', {
    description: 'Describe AE source-to-agentic adaptation capabilities and limits. Your existing developer agent remains the coding execution owner.',
    inputSchema: z.strictObject({}), annotations,
  }, () => result({
    mode: 'read-only', scope: 'One operator-configured development Git repository; client roots never grant access.',
    recipes: recipes.map(recipe => ({ ...recipe.ref, outputPaths: recipe.outputPaths, support: 'Reviewed bounded host recipe. This read-only MCP surface does not execute its separate acceptance profile.' })),
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
  }, ({ recipeId }) => guarded(() => { checkRoot(); return plannedRecipe(root, recipeId); }));
  server.registerTool('ae_preview', {
    description: 'Preview the shared recipe patch without writing. Requires the current ae_plan hash; source drift invalidates the preview.',
    inputSchema: recipeInput.extend({ planHash: Sha256 }), annotations,
  }, ({ recipeId, planHash }) => guarded(() => {
    checkRoot(); const { assessment, plan } = plannedRecipe(root, recipeId);
    if (digest(plan) !== planHash) throw new Error('Plan drift');
    return { planHash, changes: previewPatch(root, plan, assessment) };
  }));
  server.registerTool('ae_verify', {
    description: 'Statically compare supplied patch hashes against the configured repository only. Hash expectations are caller claims, not approval or authenticated provenance. No tests or customer code run.',
    inputSchema: verificationInput, annotations,
  }, ({ patch, businessHash }) => guarded(() => {
    checkRoot();
    const installed = recipes.find(recipe => digest(recipe.ref) === digest(patch.recipe));
    if (!installed || JSON.stringify(patch.changes.map(c => c.path)) !== JSON.stringify(installed.outputPaths)) throw new Error('Unknown verification recipe or path scope');
    plannedRecipe(root, installed.ref.id); // A known recipe cannot be used to verify another host kind.
    return verifyAdaptation({ patch: { ...patch, worktree: root }, businessHash, originals: {} });
  }));
  return server;
}
