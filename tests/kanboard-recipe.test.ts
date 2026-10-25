import test from 'node:test';
import assert from 'node:assert/strict';
import { KANBOARD_FILES, kanboardRecipe } from '../packages/transformation/src/recipes/kanboard.js';

test('Kanboard recipe is exact-source and plugin-only, not a generic PHP match', () => {
  assert.equal(kanboardRecipe.matches(new Map([['composer.json', '{"name":"kanboard/kanboard"}']]), ['PHP']), false);
  assert.ok(kanboardRecipe.inputs.includes('app/Helper/ProjectRoleHelper.php'));
  assert.ok(kanboardRecipe.outputs.every(path => path.startsWith('plugins/AgenticEverything/')));
  assert.equal(new Set(kanboardRecipe.outputs).size, kanboardRecipe.outputs.length);
  assert.deepEqual(kanboardRecipe.preview(() => null).map(change => change.path), kanboardRecipe.outputs);
  assert.throws(() => kanboardRecipe.preview(path => path === kanboardRecipe.outputs[0] ? 'existing user edit' : null), /conflict/);
});
test('Kanboard transport retains shared AE runtime and native host enforcement', () => {
  const runtime = KANBOARD_FILES['plugins/AgenticEverything/Runtime/serve.mjs']!;
  const controller = KANBOARD_FILES['plugins/AgenticEverything/Controller/AeController.php']!;
  assert.match(runtime, /new GovernedRuntime/); assert.match(runtime, /new ToolBroker/);
  assert.match(runtime, /FileModelProvider/); assert.match(runtime, /deterministic-demo/);
  assert.match(controller, /checkReusableCSRFParam/); assert.match(controller, /getRawFormValues/);
  assert.match(controller, /hasProjectAccess/); assert.match(controller, /canChangeAssignee/);
  assert.match(controller, /canChangeTaskStatusInColumn/); assert.match(controller, /Confirmation already consumed/);
  assert.match(controller, /hash_equals/); assert.match(controller, /state='unknown'/);
  assert.match(runtime, /RUN_TARGET_DENIED/); assert.match(runtime, /new KanboardHost\(a.taskId\)/); assert.match(runtime, /samePrincipal/); assert.match(runtime, /timingSafeEqual/);
});
test('Kanboard rechecks target eligibility inside the SQLite write lock before mutation', () => {
  const controller = KANBOARD_FILES['plugins/AgenticEverything/Controller/AeController.php']!;
  const transaction = controller.slice(controller.indexOf('$pdo->beginTransaction();'), controller.indexOf('if (!$ok)'));
  const lock = transaction.indexOf("UPDATE ae_task_operations SET state='executing'");
  const eligibility = transaction.indexOf('getAssignableUsersList');
  const mutation = transaction.indexOf('$this->taskModificationModel->update');
  assert.ok(lock >= 0 && eligibility > lock && mutation > eligibility);
  assert.match(transaction.slice(lock, mutation), /throw new AccessForbiddenException/);
});
