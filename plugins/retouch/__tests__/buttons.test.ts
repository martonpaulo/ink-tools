import {ok} from '@supernote-tools/sn-adapter/official';
import {
  ButtonDeps,
  EDIT_DATA_PICTURE,
  resetButtonsForTests,
  syncButtons,
} from '../src/buttons';
import {defaultSettings, EDITS, editOfButton, setEdit} from '../src/edits';

function fakeDeps() {
  const calls: string[] = [];
  const deps: ButtonDeps = {
    register: jest.fn(async (_type, _apps, raw) => {
      const button = raw as {name: string; editDataTypes: number[]};
      calls.push(`+${button.name}`);
      expect(button.editDataTypes).toEqual([EDIT_DATA_PICTURE]);
      return ok(true as const);
    }),
    unregister: jest.fn(async id => {
      calls.push(`-${id}`);
      return ok(true as const);
    }),
    log: () => {},
  };
  return {calls, deps};
}

beforeEach(resetButtonsForTests);

test('every edit starts on, each with its own lasso button for pictures', async () => {
  const {calls, deps} = fakeDeps();
  await syncButtons(defaultSettings, deps);
  expect(calls).toEqual(EDITS.map(e => `+${e.name}`));
  expect(new Set(EDITS.map(e => e.buttonId)).size).toBe(EDITS.length);
});

test('a switch turned off removes only its button, and nothing changes twice', async () => {
  const {calls, deps} = fakeDeps();
  await syncButtons(defaultSettings, deps);
  calls.length = 0;
  const off = setEdit(defaultSettings, 'darker', false);
  await syncButtons(off, deps);
  await syncButtons(off, deps);
  const darker = EDITS.find(e => e.id === 'darker')!;
  expect(calls).toEqual([`-${darker.buttonId}`]);
});

test('a pressed id maps back to its edit, and a foreign id to none', () => {
  expect(editOfButton(EDITS[0].buttonId)?.id).toBe('enhance');
  expect(editOfButton(1)).toBeNull();
});
