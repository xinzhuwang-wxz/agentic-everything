import type { ProjectAssessment, RecipeRefSchema } from '@ae/contracts';
import type { z } from 'zod';
import { parse } from '../ast.js';
import { helpdeskRecipe } from './react-helpdesk.js';
import { inventoryRecipe } from './python-inventory.js';
import { javaSpringRecipe, JAVA_ADAPTER } from './java-spring-inventory.js';

import { kanboardRecipe, KANBOARD_FILES } from './kanboard.js';
import { revealRecipe } from './reveal.js';
import { linkdingRecipe, checkLinkdingTemplate } from './linkding.js';

export const installedRecipes = [helpdeskRecipe, inventoryRecipe, javaSpringRecipe, revealRecipe, linkdingRecipe, kanboardRecipe];
export function recipeForAssessment(assessment: ProjectAssessment) {
  const matches = installedRecipes.filter(recipe => assessment.businessFlows.includes(recipe.observedFlow));
  if (assessment.supportLevel !== 'L2' || matches.length !== 1) throw Error('No installed recipe coverage or conflicting recipes: tailored plan needs developer review, not automatic patching');
  return matches[0]!;
}
export function recipeForRef(ref: z.infer<typeof RecipeRefSchema>) {
  const recipe = installedRecipes.find(candidate => candidate.ref.id === ref.id && candidate.ref.version === ref.version);
  if (!recipe) throw Error('Unknown reviewed recipe/version');
  return recipe;
}
export function syntaxCheck(path: string, value: string) {
  if (Object.hasOwn(KANBOARD_FILES, path)) { const valid = KANBOARD_FILES[path] === value; return { status: valid ? 'pass' as const : 'fail' as const, expected: 'Exact reviewed Kanboard plugin template', actual: valid ? 'Reviewed template matches; PHP lint and host runtime require the approved pinned-source profile' : 'Generated Kanboard template drift' }; }
  if (linkdingRecipe.outputs.includes(path)) { const valid = checkLinkdingTemplate(path, value); return { status: valid ? 'pass' as const : 'fail' as const, expected: 'Exact reviewed linkding template', actual: valid ? 'Reviewed template matches; runtime requires the approved pinned-source profile' : 'Generated linkding template drift' }; }
  if (path.endsWith('.java')) { const valid = path === 'agentic/AeHost.java' && value === JAVA_ADAPTER; return { status: valid ? 'pass' as const : 'fail' as const, expected: 'Exact reviewed Java/Spring Core adapter', actual: valid ? 'Reviewed Java template matches; compilation requires explicit fixture profile' : 'Generated Java template drift' }; }
  if (path.endsWith('.py')) {
    const expected = inventoryRecipe.preview(name => name === 'inventory.py' ? 'present' : null).find(change => change.path === path)?.after;
    const valid = value === expected;
    return { status: valid ? 'pass' as const : 'fail' as const, expected: 'Exact reviewed generated Python adapter', actual: valid ? 'Reviewed Python template matches; execution checked only in authorized profile' : 'Generated Python template drift' };
  }
  try { parse(path, value); return { status: 'pass' as const, expected: 'Parseable TSX', actual: 'TypeScript parser accepted' }; }
  catch { return { status: 'fail' as const, expected: 'Parseable TSX', actual: 'Parse error' }; }
}
export function executionGates(ref: z.infer<typeof RecipeRefSchema>): string[] {
  if (ref.id === 'linkding-django' || ref.id === 'kanboard-upstream') return ['host-compilation', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'browser-acceptance'];
  if (ref.id === 'reveal-local') return ['host-syntax-check', 'host-business-tests', 'black-box-business-differential', 'local-authority-runtime', 'browser-acceptance', 'fixture-process-completion'];
  return ['python-inventory', 'java-spring-inventory'].includes(ref.id) ? ['host-compilation', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'cli-acceptance'] : ['host-typecheck', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'browser-acceptance'];
}
