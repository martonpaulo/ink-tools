import {PluginFileAPI} from 'sn-plugin-lib';
import {BAD_ARGUMENT_CODE, insertNotePage, insertPageAfter} from '../src/official';

const mocked = (fn: unknown) => fn as jest.Mock;
const NOTE = '/storage/emulated/0/Note/Tests/Puzzles.note';
const PAGE_PNG = '/storage/emulated/0/MyStyle/puzzle.png';

beforeEach(() => jest.resetAllMocks());

describe('inserting a page', () => {
  test('after the current page means the index after it', async () => {
    // Device round 11 (#379): `page` is the index the new page takes, so passing the current
    // page put the new page before it, and pages inserted in a row came out of order.
    mocked(PluginFileAPI.insertNotePage).mockResolvedValue({success: true, result: true});
    await expect(insertPageAfter(NOTE, 2, PAGE_PNG)).resolves.toEqual({ok: true, value: true});
    expect(PluginFileAPI.insertNotePage).toHaveBeenCalledWith({notePath: NOTE, page: 3, template: PAGE_PNG});
  });

  test('a run of pages after the first page lands in order', async () => {
    mocked(PluginFileAPI.insertNotePage).mockResolvedValue({success: true, result: true});
    for (let current = 0; current < 3; current++) await insertPageAfter(NOTE, current, PAGE_PNG);
    expect(mocked(PluginFileAPI.insertNotePage).mock.calls.map(([call]) => call.page)).toEqual([1, 2, 3]);
  });

  test('a page index below 0 is refused before any call', async () => {
    await expect(insertPageAfter(NOTE, -1, PAGE_PNG)).resolves.toEqual(expect.objectContaining({ok: false, code: BAD_ARGUMENT_CODE}));
    expect(PluginFileAPI.insertNotePage).not.toHaveBeenCalled();
  });

  test('insertNotePage passes the index through', async () => {
    mocked(PluginFileAPI.insertNotePage).mockResolvedValue({success: true, result: true});
    await insertNotePage(NOTE, 0, 'style_white');
    expect(PluginFileAPI.insertNotePage).toHaveBeenCalledWith({notePath: NOTE, page: 0, template: 'style_white'});
  });
});
