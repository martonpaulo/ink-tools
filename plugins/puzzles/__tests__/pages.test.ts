/** The note pages a game reads and writes (#386), against sn-adapter's SDK mock. */
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {toBase64} from '@ink-tools/puzzle-core';
import {devicePages, PAGE_FILE_MODULE, PAGE_FOLDER, type Here} from '../src/play/pages';

const mocked = (fn: unknown) => fn as jest.Mock;
const NOTE = '/storage/emulated/0/Note/Puzzles.note';
const HERE: Here = {notePath: NOTE, page: 2, size: {width: 1920, height: 2560}, orientation: 'portrait'};
const CODE = 'MZ-10X13-E-7K2Q9X';
const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('the current page', () => {
  test('is the open note, its page and its orientation', async () => {
    mocked(PluginCommAPI.getCurrentFilePath).mockResolvedValue({success: true, result: NOTE});
    mocked(PluginCommAPI.getCurrentPageNum).mockResolvedValue({success: true, result: 2});
    mocked(PluginFileAPI.getPageSize).mockResolvedValue({success: true, result: {width: 2560, height: 1920}});
    await expect(devicePages({}).here()).resolves.toEqual({ok: true, value: {...HERE, size: {width: 2560, height: 1920}, orientation: 'landscape'}});
  });

  test('with no note open is a failure', async () => {
    mocked(PluginCommAPI.getCurrentFilePath).mockResolvedValue({success: false, error: {code: 118, message: 'The handwriting app is not open'}});
    await expect(devicePages({}).here()).resolves.toEqual(expect.objectContaining({ok: false, code: 118}));
  });

  test('names its puzzle by its background', async () => {
    mocked(PluginFileAPI.getNotePageTemplate).mockResolvedValue({success: true, result: {name: `user_${CODE}`, md5: 'x'}});
    await expect(devicePages({}).codeOf(HERE)).resolves.toEqual({ok: true, value: CODE});
  });
});

describe('a new page', () => {
  const written: [string, string][] = [];
  const cleared: string[] = [];
  beforeEach(() => {
    written.length = 0;
    cleared.length = 0;
  });
  const writeBase64 = async (path: string, base64: string) => {
    written.push([path, base64]);
    return true;
  };
  const removePages = async (folder: string) => {
    cleared.push(folder);
    return 2;
  };
  const modules = {[PAGE_FILE_MODULE]: {writeBase64, removePages}};

  test('waits in the hidden plugin folder, never in MyStyle, which Supernote Cloud syncs', () => {
    expect(PAGE_FOLDER).toBe('/storage/emulated/0/.data/plugin/inktools-puzzles/pages');
    expect(PAGE_FOLDER).not.toContain('MyStyle');
  });

  test('writes the PNG named by its code and inserts it after the saved page', async () => {
    mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue({success: true, result: true});
    mocked(PluginFileAPI.insertNotePage).mockResolvedValue({success: true, result: true});
    await expect(devicePages(modules).insert(HERE, CODE, PNG)).resolves.toEqual({ok: true, value: true});
    const path = `${PAGE_FOLDER}/${CODE}.png`;
    expect(written).toEqual([[path, toBase64(PNG)]]);
    expect(PluginFileAPI.insertNotePage).toHaveBeenCalledWith({notePath: NOTE, page: 3, template: path});
  });

  test('deletes its picture right after the insert, as the note keeps its own copy (#541)', async () => {
    mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue({success: true, result: true});
    mocked(PluginFileAPI.insertNotePage).mockResolvedValue({success: true, result: true});
    await expect(devicePages(modules).insert(HERE, CODE, PNG)).resolves.toEqual({ok: true, value: true});
    expect(cleared).toEqual([PAGE_FOLDER]);
  });

  test('a refused delete after the insert keeps the insert a success (#541)', async () => {
    mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue({success: true, result: true});
    mocked(PluginFileAPI.insertNotePage).mockResolvedValue({success: true, result: true});
    const refusing = {[PAGE_FILE_MODULE]: {writeBase64, removePages: async () => {
      throw new Error('no DELETE permission');
    }}};
    await expect(devicePages(refusing).insert(HERE, CODE, PNG)).resolves.toEqual({ok: true, value: true});
  });

  test('keeps its picture when the insert fails, for the next view to delete', async () => {
    mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue({success: true, result: true});
    mocked(PluginFileAPI.insertNotePage).mockResolvedValue({success: true, result: false});
    await expect(devicePages(modules).insert(HERE, CODE, PNG)).resolves.toEqual(expect.objectContaining({ok: false}));
    expect(cleared).toEqual([]);
  });

  test('the page files an earlier insert left are deleted', async () => {
    await expect(devicePages(modules).clear()).resolves.toEqual({ok: true, value: 2});
    expect(cleared).toEqual([PAGE_FOLDER]);
  });

  test('is not inserted when the note does not save', async () => {
    mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue({success: true, result: false});
    await expect(devicePages(modules).insert(HERE, CODE, PNG)).resolves.toEqual(expect.objectContaining({ok: false}));
    expect(PluginFileAPI.insertNotePage).not.toHaveBeenCalled();
  });

  test('fails when the page file module is not loaded', async () => {
    await expect(devicePages({}).insert(HERE, CODE, PNG)).resolves.toEqual(expect.objectContaining({ok: false, message: expect.stringContaining(PAGE_FILE_MODULE)}));
    await expect(devicePages({}).clear()).resolves.toEqual(expect.objectContaining({ok: false}));
    expect(PluginFileAPI.insertNotePage).not.toHaveBeenCalled();
  });
});

describe('the ink of a page', () => {
  test('is its strokes in page pixels, read after the note saved', async () => {
    const points = [{x: 0, y: 0}, {x: 1, y: 1}];
    const stroke = {type: 0, stroke: {points: {size: async () => points.length, getRange: async (start: number, count: number) => points.slice(start, start + count)}}};
    mocked(PluginNoteAPI.saveCurrentNote).mockResolvedValue({success: true, result: true});
    mocked(PluginFileAPI.getElements).mockResolvedValue({success: true, result: [stroke, {type: 200}]});
    const ink = await devicePages({}).ink(HERE);
    expect(ink).toEqual({ok: true, value: [{points: [{x: 0, y: 0}, {x: 1, y: 1}], element: stroke}]});
    expect(PluginFileAPI.getElements).toHaveBeenCalledWith(2, NOTE);
  });
});
