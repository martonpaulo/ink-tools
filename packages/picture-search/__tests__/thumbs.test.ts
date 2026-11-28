/**
 * The stored thumbnails (#16, #46) of picture-search's insert tier. The grid that shows them
 * belongs to the plugin that draws it; no test here covers it (#302).
 */
import {NativeModules} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import '../testing/profile';
import {resetSessionForTests} from '../src/storage';
import {
  cachedThumbUri,
  prepareThumbs,
  resetThumbsForTests,
  storeDerived,
  THUMB_LIMIT,
  thumbPath,
  thumbUri,
} from '../src/insert';
import type {SearchResult} from '../src/types';

const DIR = '/data/plugin';
const THUMBS = `${DIR}/thumbs`;

function result(n: number): SearchResult {
  return {
    id: `openclipart:${n}`,
    source: 'openclipart',
    title: `Picture ${n}`,
    thumbUrl: `https://openclipart.org/image/400px/${n}`,
    license: 'CC0 1.0',
    attribution: 'Openclipart',
  };
}

const CALLS = [
  'downloadToFile',
  'downloadThumbToFile',
  'deleteFile',
  'writeText',
  'readText',
  'listDir',
] as const;
/** The file module's calls the thumbnail store makes, each a mock. */
const native = Object.fromEntries(CALLS.map(name => [name, jest.fn()])) as Record<
  (typeof CALLS)[number],
  jest.Mock
>;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.TestFiles = native;
  resetSessionForTests();
  resetThumbsForTests();
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(DIR);
  native.readText.mockResolvedValue(null);
  native.writeText.mockResolvedValue(null);
  native.downloadToFile.mockResolvedValue(42000);
  native.downloadThumbToFile.mockResolvedValue(42000);
  native.deleteFile.mockResolvedValue(true);
  native.listDir.mockResolvedValue([]);
});

const fileUri = (n: number) => `file://${THUMBS}/openclipart-${n}`;
const downloaded = () =>
  native.downloadThumbToFile.mock.calls.map(call => call[1]);
const deleted = () => native.deleteFile.mock.calls.map(call => call[0]);
/** A thumbnail's file and its converted files, as makeRoom removes them (#102). */
const withSiblings = (path: string) => [
  path,
  `${path}.contour.png`,
  `${path}.dark.png`,
];
describe('thumbnail files (#16, #46)', () => {
  it('names a safe file under the thumbs folder', () => {
    expect(thumbPath(DIR, result(7))).toBe(`${THUMBS}/openclipart-7`);
  });

  it('reads the file when it is stored, else the web URL', () => {
    const stored = new Set([`${THUMBS}/openclipart-7`]);
    const has = (path: string) => stored.has(path);
    expect(cachedThumbUri(result(7), DIR, has)).toBe(fileUri(7));
    expect(cachedThumbUri(result(8), DIR, has)).toBe(result(8).thumbUrl);
  });

  it('downloads a missing thumbnail once, as a background download, and renders the file', async () => {
    await prepareThumbs();
    const [first, second] = await Promise.all([
      thumbUri(result(1), DIR),
      thumbUri(result(1), DIR),
    ]);
    expect(first).toBe(fileUri(1));
    expect(second).toBe(fileUri(1));
    expect(await thumbUri(result(1), DIR)).toBe(fileUri(1));
    expect(downloaded()).toEqual([`${THUMBS}/openclipart-1`]);
    // The insert's own download is never used for a thumbnail.
    expect(native.downloadToFile).not.toHaveBeenCalled();
    expect(cachedThumbUri(result(1), DIR)).toBe(fileUri(1));
  });

  it('skips stored thumbnails, listed by name, and ignores part files', async () => {
    native.listDir.mockResolvedValue([
      'openclipart-1',
      'openclipart-2',
      'openclipart-3.part',
    ]);
    await prepareThumbs();
    for (const n of [1, 2, 3]) {
      expect(await thumbUri(result(n), DIR)).toBe(fileUri(n));
    }
    expect(downloaded()).toEqual([`${THUMBS}/openclipart-3`]);
  });

  it('falls back to the web URL when the download fails, and keeps it off the list', async () => {
    await prepareThumbs();
    native.downloadThumbToFile.mockRejectedValue(
      Object.assign(new Error('HTTP 503'), {code: 'HTTP_503'}),
    );
    expect(await thumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    expect(cachedThumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
  });

  it('treats an empty download as a failed thumbnail, never a stored one (#65)', async () => {
    // Openclipart image/400px/2370 answers 200 with content-length 0 (research, 2026-11-06).
    await prepareThumbs();
    native.downloadThumbToFile.mockResolvedValue(0);
    native.deleteFile.mockResolvedValue(true);
    expect(await thumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    expect(cachedThumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    expect(native.deleteFile).toHaveBeenCalledWith(`${THUMBS}/openclipart-1`);
  });

  it('removes the oldest file first at the limit', async () => {
    native.listDir.mockResolvedValue(
      Array.from({length: THUMB_LIMIT}, (_, n) => `old-${n}`),
    );
    await prepareThumbs();
    expect(await thumbUri(result(1), DIR)).toBe(fileUri(1));
    expect(deleted()).toEqual(withSiblings(`${THUMBS}/old-0`));
  });

  it('counts a converted file only without its thumbnail, and removes it with it (#102)', async () => {
    const names = Array.from({length: THUMB_LIMIT}, (_, n) => `old-${n}`);
    // old-0 has both conversions; old-1 is gone but left its contour drawing.
    native.listDir.mockResolvedValue([
      'old-1.contour.png',
      ...names.slice(0, 1),
      'old-0.contour.png',
      'old-0.dark.png',
      ...names.slice(2),
    ]);
    await prepareThumbs();
    // THUMB_LIMIT - 1 thumbnails and one lone contour file: the store is full.
    expect(await thumbUri(result(1), DIR)).toBe(fileUri(1));
    expect(deleted()).toEqual([`${THUMBS}/old-1.contour.png`]);
    expect(await thumbUri(result(2), DIR)).toBe(fileUri(2));
    expect(deleted().slice(1)).toEqual(withSiblings(`${THUMBS}/old-0`));
  });

  it('counts a saved symbol’s converted file, written with no thumbnail beside it (#102, #103)', async () => {
    native.listDir.mockResolvedValue(
      Array.from({length: THUMB_LIMIT - 1}, (_, n) => `old-${n}`),
    );
    await prepareThumbs();
    storeDerived(`${THUMBS}/openclipart-1.contour.png`); // its thumbnail is not stored: counted
    storeDerived(`${THUMBS}/openmoji-1F600.contour.png`);
    expect(await thumbUri(result(1), DIR)).toBe(fileUri(1));
    // THUMB_LIMIT - 1 thumbnails and two converted files: two oldest leave for the new one.
    expect(deleted()).toEqual([
      ...withSiblings(`${THUMBS}/old-0`),
      ...withSiblings(`${THUMBS}/old-1`),
    ]);
    native.deleteFile.mockClear();
    // A converted file of a stored thumbnail leaves with it and is not counted twice.
    storeDerived(`${THUMBS}/openclipart-1.dark.png`);
    expect(await thumbUri(result(2), DIR)).toBe(fileUri(2));
    expect(deleted()).toEqual(withSiblings(`${THUMBS}/old-2`));
  });

  it('removes a different old file for each download running at the limit', async () => {
    native.listDir.mockResolvedValue(
      Array.from({length: THUMB_LIMIT}, (_, n) => `old-${n}`),
    );
    await prepareThumbs();
    await Promise.all([1, 2, 3].map(n => thumbUri(result(n), DIR)));
    expect(deleted().filter(path => !path.endsWith('.png'))).toEqual([
      `${THUMBS}/old-0`,
      `${THUMBS}/old-1`,
      `${THUMBS}/old-2`,
    ]);
    expect(downloaded()).toHaveLength(3);
  });

  it('loads from the web without downloading when an old file cannot be removed', async () => {
    native.listDir.mockResolvedValue(
      Array.from({length: THUMB_LIMIT}, (_, n) => `old-${n}`),
    );
    native.deleteFile.mockRejectedValue(
      Object.assign(new Error('denied'), {code: 'IO'}),
    );
    await prepareThumbs();
    expect(await thumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    expect(native.downloadThumbToFile).not.toHaveBeenCalled();
    expect(cachedThumbUri({...result(0), id: 'old-0'}, DIR)).toBe(
      `file://${THUMBS}/old-0`,
    );
  });

  it('starts empty when the folder does not exist yet', async () => {
    native.listDir.mockResolvedValue(null);
    expect(await prepareThumbs()).toBe(DIR);
    expect(await thumbUri(result(1), DIR)).toBe(fileUri(1));
  });

  it('turns the store off when the folder cannot be listed', async () => {
    native.listDir.mockRejectedValue(
      Object.assign(new Error('denied'), {code: 'IO'}),
    );
    expect(await prepareThumbs()).toBeNull();
    expect(await thumbUri(result(1), DIR)).toBe(result(1).thumbUrl);
    expect(native.downloadThumbToFile).not.toHaveBeenCalled();
  });

  it('never stores a library file', async () => {
    await prepareThumbs();
    const local = {...result(1), thumbUrl: 'file:///lib/a.png'};
    expect(await thumbUri(local, DIR)).toBe('file:///lib/a.png');
    expect(native.downloadThumbToFile).not.toHaveBeenCalled();
    expect(cachedThumbUri(local, DIR)).toBe('file:///lib/a.png');
  });
});

