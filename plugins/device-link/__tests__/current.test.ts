/** `current` (#320): the open note and its page on screen, for Note Editor's Follow Tablet. */
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {currentAction} from '../src/editor/current';

const OPEN = '/storage/emulated/0/Note/Tests/A.note';

test('answers the open note and the page on screen, from 0', async () => {
  const answer = await currentAction({openNote: async () => ok(OPEN), currentPage: async () => ok(2)})();
  expect(answer).toEqual({line: `DeviceLink: current: page 2 of ${OPEN}`, openNote: OPEN, page: 2});
});

test('with no note open answers null for both and reads no page', async () => {
  const currentPage = jest.fn(async () => ok(0));
  const answer = await currentAction({openNote: async () => ok(''), currentPage})();
  expect(answer).toEqual({line: 'DeviceLink: current: no note is open', openNote: null, page: null});
  expect(currentPage).not.toHaveBeenCalled();
});

test('a failed read is a failure, never a note or a page', async () => {
  await expect(currentAction({openNote: async () => fail(9, 'host busy'), currentPage: async () => ok(0)})()).rejects.toThrow('getCurrentFilePath failed: 9 host busy');
  await expect(currentAction({openNote: async () => ok(OPEN), currentPage: async () => fail(9, 'host busy')})()).rejects.toThrow('getCurrentPageNum failed: 9 host busy');
  await expect(currentAction({openNote: async () => ok(OPEN), currentPage: async () => ok(-1)})()).rejects.toThrow('not a page index from 0');
});
