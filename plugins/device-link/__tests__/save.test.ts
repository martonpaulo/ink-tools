/**
 * `save-note` (#426): inkctl saves the open note before it opens another, since a switch by intent
 * lost a native lasso delete and a Collection paste (device round 10).
 */
import {saveNoteAction} from '../src/editor/save';

const OPEN = '/storage/emulated/0/Note/Tests/A.note';

test('saves the open note and names it', async () => {
  const saveOpenNote = jest.fn(async () => ({ok: true as const, value: true}));
  const answer = await saveNoteAction({openNote: async () => ({ok: true, value: OPEN}), saveOpenNote})();
  expect(saveOpenNote).toHaveBeenCalledTimes(1);
  expect(answer).toEqual({line: `DeviceLink: save-note: saved ${OPEN}`, openNote: OPEN, saved: true});
});

test('with no note open it saves nothing and says so', async () => {
  const saveOpenNote = jest.fn(async () => ({ok: true as const, value: true}));
  const answer = await saveNoteAction({openNote: async () => ({ok: true, value: ''}), saveOpenNote})();
  expect(saveOpenNote).not.toHaveBeenCalled();
  expect(answer).toMatchObject({openNote: null, saved: false});
});

test.each([
  ['answers false', {ok: true, value: false} as const, `saveCurrentNote did not save ${OPEN}: answered false`],
  ['fails', {ok: false, code: 1501, message: 'no permission'} as const, `saveCurrentNote did not save ${OPEN}: 1501 no permission`],
])('a save that %s fails the action, never a success', async (_name, result, message) => {
  const action = saveNoteAction({openNote: async () => ({ok: true, value: OPEN}), saveOpenNote: async () => result});
  await expect(action()).rejects.toThrow(message);
});

test('a failed read of the open note fails the action', async () => {
  const action = saveNoteAction({openNote: async () => ({ok: false, code: 9, message: 'host busy'}), saveOpenNote: async () => ({ok: true, value: true})});
  await expect(action()).rejects.toThrow('getCurrentFilePath failed: 9 host busy');
});
