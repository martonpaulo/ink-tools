/** One «Image Editing» lasso button opens the editor; no per-edit rows (#226). */
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {
  BUTTON_TYPE_LASSO,
  ButtonDeps,
  EDIT_DATA_PICTURE,
  registerEditorButton,
  SHOW_FULL_VIEW,
} from '../src/buttons';
import {EDITOR_BUTTON_ID, EDITS, LEGACY_BUTTON_IDS} from '../src/edits';

function fakeDeps(held: readonly number[] = []) {
  const logs: string[] = [];
  const deps: ButtonDeps = {
    register: jest.fn(async () => ok(true as const)),
    unregister: jest.fn(async id =>
      held.includes(id) ? ok(true as const) : fail(1, 'no such button'),
    ),
    log: line => logs.push(line),
  };
  return {deps, logs};
}

test('the plugin registers one lasso button, «Image Editing», for pictures, with a full view', async () => {
  const {deps} = fakeDeps();
  expect(await registerEditorButton(deps)).toEqual(ok(true));
  const register = deps.register as jest.Mock;
  expect(register).toHaveBeenCalledTimes(1);
  expect(register.mock.calls[0]).toEqual([
    BUTTON_TYPE_LASSO,
    ['NOTE'],
    {
      id: EDITOR_BUTTON_ID,
      name: 'Image Editing',
      editDataTypes: [EDIT_DATA_PICTURE],
      showType: SHOW_FULL_VIEW,
    },
  ]);
});

test('the rows of earlier builds, one per edit, are removed first', async () => {
  const {deps, logs} = fakeDeps([LEGACY_BUTTON_IDS[0], LEGACY_BUTTON_IDS[3]]);
  await registerEditorButton(deps);
  expect((deps.unregister as jest.Mock).mock.calls.map(call => call[0])).toEqual([
    ...LEGACY_BUTTON_IDS,
  ]);
  expect(LEGACY_BUTTON_IDS).toHaveLength(EDITS.length);
  expect(LEGACY_BUTTON_IDS).not.toContain(EDITOR_BUTTON_ID);
  expect(logs[0]).toBe('removed 2 lasso rows of an earlier build');
});

test('a refused registration is logged and answered', async () => {
  const {deps, logs} = fakeDeps();
  deps.register = jest.fn(async () => fail(7, 'refused'));
  expect(await registerEditorButton(deps)).toEqual(fail(7, 'refused'));
  expect(logs).toEqual(['register Image Editing failed: 7 refused']);
});
