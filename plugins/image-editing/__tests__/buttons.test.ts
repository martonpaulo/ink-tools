/** One «Image Editing» lasso button opens the editor; no per-edit rows (#226). */
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {
  BUTTON_TYPE_LASSO,
  BUTTON_TYPE_SIDEBAR,
  ButtonDeps,
  EDIT_DATA_ANY,
  registerEditorButton,
  SHOW_FULL_VIEW,
} from '../src/buttons';
import {EDITOR_BUTTON_ID, EDITOR_TOOLBAR_ID, EDITS, LEGACY_BUTTON_IDS} from '../src/edits';

function fakeDeps(held: readonly number[] = []) {
  const logs: string[] = [];
  const deps: ButtonDeps = {
    register: jest.fn(async () => ok(true as const)),
    unregister: jest.fn(async id =>
      held.includes(id) ? ok(true as const) : fail(1, 'no such button'),
    ),
    log: line => logs.push(line),
    icon: 'file:///editor.png',
  };
  return {deps, logs};
}

test('the plugin registers one lasso button, «Image Editing», for any lasso, with a full view (#522)', async () => {
  const {deps} = fakeDeps();
  expect(await registerEditorButton(deps)).toEqual(ok(true));
  const register = deps.register as jest.Mock;
  expect(register).toHaveBeenCalledTimes(2);
  expect(register.mock.calls[0]).toEqual([
    BUTTON_TYPE_LASSO,
    ['NOTE'],
    {
      id: EDITOR_BUTTON_ID,
      name: 'Image Editing',
      editDataTypes: [...EDIT_DATA_ANY],
      showType: SHOW_FULL_VIEW,
      icon: 'file:///editor.png',
    },
  ]);
});

test('the same «Image Editing» is a toolbar button with its icon, which the owner can pin (#248)', async () => {
  const {deps, logs} = fakeDeps();
  await registerEditorButton(deps);
  expect((deps.register as jest.Mock).mock.calls[1]).toEqual([
    BUTTON_TYPE_SIDEBAR,
    ['NOTE'],
    {
      id: EDITOR_TOOLBAR_ID,
      name: 'Image Editing',
      showType: SHOW_FULL_VIEW,
      icon: 'file:///editor.png',
    },
  ]);
  expect(logs).toContain('register Image Editing toolbar button: ok');
  expect([EDITOR_BUTTON_ID, ...LEGACY_BUTTON_IDS]).not.toContain(EDITOR_TOOLBAR_ID);
});

test('a refused toolbar button leaves the lasso row registered (#248)', async () => {
  const {deps, logs} = fakeDeps();
  deps.register = jest.fn(async (type: number) =>
    type === BUTTON_TYPE_SIDEBAR ? fail(7, 'refused') : ok(true as const),
  ) as unknown as ButtonDeps['register'];
  expect(await registerEditorButton(deps)).toEqual(ok(true));
  expect(logs).toEqual([
    'register Image Editing: ok',
    'register Image Editing toolbar button failed: 7 refused',
  ]);
});

test('the rows of earlier builds, one per edit, are removed after the registration', async () => {
  const {deps, logs} = fakeDeps([LEGACY_BUTTON_IDS[0], LEGACY_BUTTON_IDS[3]]);
  await registerEditorButton(deps);
  await new Promise(resolve => setImmediate(resolve));
  expect((deps.unregister as jest.Mock).mock.calls.map(call => call[0])).toEqual([
    ...LEGACY_BUTTON_IDS,
  ]);
  expect((deps.register as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    (deps.unregister as jest.Mock).mock.invocationCallOrder[0],
  );
  expect(LEGACY_BUTTON_IDS).toHaveLength(EDITS.length);
  expect(LEGACY_BUTTON_IDS).not.toContain(EDITOR_BUTTON_ID);
  expect(logs).toEqual([
    'register Image Editing: ok',
    'register Image Editing toolbar button: ok',
    `removed lasso row ${LEGACY_BUTTON_IDS[0]} of an earlier build`,
    `removed lasso row ${LEGACY_BUTTON_IDS[3]} of an earlier build`,
  ]);
});

test('an unregister that never settles still leaves the button registered (#226)', async () => {
  const {deps} = fakeDeps();
  deps.unregister = jest.fn(() => new Promise<never>(() => {}));
  expect(await registerEditorButton(deps)).toEqual(ok(true));
  expect(deps.register).toHaveBeenCalledTimes(2);
  expect(deps.unregister).toHaveBeenCalledTimes(LEGACY_BUTTON_IDS.length);
});

test('a refused registration is logged and answered', async () => {
  const {deps, logs} = fakeDeps();
  deps.register = jest.fn(async () => fail(7, 'refused'));
  expect(await registerEditorButton(deps)).toEqual(fail(7, 'refused'));
  expect(logs[0]).toBe('register Image Editing failed: 7 refused');
});

test('the button icon is drawn from its SVG and bundled by name (#107)', () => {
  const fs = require('fs');
  const path = require('path');
  const assets = path.join(__dirname, '..', 'assets');
  expect(fs.existsSync(path.join(assets, 'editor.svg'))).toBe(true);
  expect(fs.existsSync(path.join(assets, 'editor.png'))).toBe(true);
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'buttons.ts'), 'utf8');
  expect(source).toContain("require('../assets/editor.png')");
});
