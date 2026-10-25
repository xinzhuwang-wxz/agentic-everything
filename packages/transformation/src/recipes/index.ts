import type { ProjectAssessment, RecipeRefSchema } from '@ae/contracts';
import type { z } from 'zod';
import { parse } from '../ast.js';
import { helpdeskRecipe } from './react-helpdesk.js';
import { inventoryRecipe } from './python-inventory.js';

export const installedRecipes = [helpdeskRecipe, inventoryRecipe];
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
  if (path.endsWith('.py')) {
    const expected = inventoryRecipe.preview(name => name === 'inventory.py' ? 'present' : null).find(change => change.path === path)?.after;
    const valid = value === expected;
    return { status: valid ? 'pass' as const : 'fail' as const, expected: 'Exact reviewed generated Python adapter', actual: valid ? 'Reviewed Python template matches; execution checked only in authorized profile' : 'Generated Python template drift' };
  }
  try { parse(path, value); return { status: 'pass' as const, expected: 'Parseable TSX', actual: 'TypeScript parser accepted' }; }
  catch { return { status: 'fail' as const, expected: 'Parseable TSX', actual: 'Parse error' }; }
}
export function executionGates(ref: z.infer<typeof RecipeRefSchema>): string[] {
  return ref.id === 'python-inventory' ? ['host-compilation', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'cli-acceptance'] : ['host-typecheck', 'host-business-tests', 'black-box-business-differential', 'authenticated-runtime', 'browser-acceptance'];
}
