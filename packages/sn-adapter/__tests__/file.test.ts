import {FileUtils, PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {BAD_ARGUMENT_CODE, insertNotePage, insertPageAfter, listFolder, noteSystemTemplates, THROWN_CODE} from '../src/official';

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

describe('the tablet\'s templates (#451)', () => {
  test('the system templates are the names of the bare list the call answers', async () => {
    mocked(PluginCommAPI.getNoteSystemTemplates).mockResolvedValue([
      {name: 'style_white', vUri: 'android.resource://x/drawable/a', hUri: 'android.resource://x/drawable/b'},
      {name: 'style_8mm_lines', vUri: '', hUri: ''},
    ]);
    await expect(noteSystemTemplates()).resolves.toEqual({ok: true, value: ['style_white', 'style_8mm_lines']});
  });

  test.each([[null], [[]], [[{vUri: 'x'}]], [{success: true, result: []}]])('no list, an empty list or a nameless entry is a failure: %j', async answer => {
    mocked(PluginCommAPI.getNoteSystemTemplates).mockResolvedValue(answer);
    await expect(noteSystemTemplates()).resolves.toEqual(expect.objectContaining({ok: false, code: THROWN_CODE}));
  });

  test('a folder lists each entry with its full path and kind, and null is an empty folder', async () => {
    mocked(FileUtils.listFiles).mockResolvedValueOnce([
      {path: '/storage/emulated/0/MyStyle/grid.png', type: 1},
      {path: '/storage/emulated/0/MyStyle/fonts', type: 0},
    ]);
    await expect(listFolder('/storage/emulated/0/MyStyle')).resolves.toEqual({
      ok: true,
      value: [
        {path: '/storage/emulated/0/MyStyle/grid.png', folder: false},
        {path: '/storage/emulated/0/MyStyle/fonts', folder: true},
      ],
    });
    mocked(FileUtils.listFiles).mockResolvedValueOnce(null);
    await expect(listFolder('/storage/emulated/0/MyStyle')).resolves.toEqual({ok: true, value: []});
  });

  test('a missing folder or an answer of another shape is a failure', async () => {
    mocked(FileUtils.listFiles).mockRejectedValueOnce(new Error('Dir is not exists'));
    await expect(listFolder('/x')).resolves.toEqual(expect.objectContaining({ok: false, message: 'Dir is not exists'}));
    mocked(FileUtils.listFiles).mockResolvedValueOnce(['grid.png']);
    await expect(listFolder('/x')).resolves.toEqual(expect.objectContaining({ok: false, code: THROWN_CODE}));
  });
});
