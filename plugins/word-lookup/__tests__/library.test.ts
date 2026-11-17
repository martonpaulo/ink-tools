/**
 * Lookup keeps the pictures it inserts out of Supernote file sync (#23, owner D13 B): in the
 * private plugin folder, reused from there, the measured MyStyle folder only after a failed
 * insert, and the old synced folders counted for Settings.
 */
import {NativeModules} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {SearchResult} from '@ink-tools/picture-search';
import {fail, ok, TIMEOUT_CODE} from '@ink-tools/sn-adapter/official';
import {
  findKept,
  indexPath,
  keptPaths,
  LibraryDeps,
  oldFolders,
  privatePicturesDir,
  recordKept,
} from '../src/library';
import {insertKept, LOOKUP_PICTURES} from '../src/pictures';
import {atStep, InsertRecord, PictureStore} from '../src/profile';

const PLUGIN_DIR =
  '/data/user/0/com.ratta.supernote.pluginhost/files/plugins/t2obvupqt3edmnrr';

const apple = {
  id: 'commons:Apple.png',
  source: 'commons',
  title: 'Apple',
} as SearchResult;

const plain = {width: 200, placement: 'below' as const, contour: false};

const args = (): Parameters<typeof insertKept>[0] => [
  apple,
  'apple',
  null,
  false,
  plain,
  null,
  () => null,
];

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('insertKept (#23)', () => {
  test('prepares and inserts the picture in the private folder, never under MyStyle', async () => {
    const insert = jest.fn(async (store: PictureStore) => ok(store.dir()));
    const done = await insertKept(
      args(),
      async () => ok(PLUGIN_DIR),
      insert as never,
    );
    expect(done).toEqual(ok(`${PLUGIN_DIR}/pictures`));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0].dir()).not.toContain('MyStyle');
  });

  test('a failed insert from the private folder is tried once from MyStyle/Lookup/pictures', async () => {
    const insert = jest
      .fn()
      .mockResolvedValueOnce(atStep('place', fail(1501, 'not inserted')))
      .mockImplementationOnce(async (store: PictureStore) => ok(store.dir()));
    const done = await insertKept(
      args(),
      async () => ok(PLUGIN_DIR),
      insert as never,
    );
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).toBe(LOOKUP_PICTURES);
    expect(done.ok && done.value).toMatch(/MyStyle\/Lookup\/pictures$/);
    // The early download was used by the first try; the second one never waits on it.
    expect(insert.mock.calls[1][6]).toBeNull();
  });

  test('a TIMEOUT or a failed download is never tried again', async () => {
    for (const failure of [
      atStep('place', fail(TIMEOUT_CODE, 'slow')),
      atStep('download', fail(-1, 'offline')),
    ]) {
      const insert = jest.fn().mockResolvedValue(failure);
      expect(
        await insertKept(args(), async () => ok(PLUGIN_DIR), insert as never),
      ).toBe(failure);
      expect(insert).toHaveBeenCalledTimes(1);
    }
  });
});

/** An in-memory private folder. */
function memory(complete = true): LibraryDeps & {files: Map<string, string>} {
  const files = new Map<string, string>();
  return {
    files,
    folder: async () => ok(PLUGIN_DIR),
    read: async path => ok(files.get(path) ?? null),
    write: async (path, text) => {
      files.set(path, text);
      return ok(null);
    },
    complete: async () => ok(complete),
  };
}

const record = (contour: boolean): InsertRecord => ({
  id: apple.id,
  source: 'commons',
  sourceId: 'Apple.png',
  sourceUrl: 'https://upload.wikimedia.org/Apple.png',
  query: 'apple',
  license: 'CC0 1.0',
  attribution: 'Commons',
  savedAt: '2026-11-17T00:00:00.000Z',
  path: `${privatePicturesDir(PLUGIN_DIR)}/commons-Apple.png${
    contour ? '.contour' : ''
  }.png`,
  width: 200,
  height: 180,
  contour,
});

describe('the kept pictures (#23)', () => {
  test('a picture inserted before is found again with its size, in its own style only', async () => {
    const deps = memory();
    expect(await findKept(apple.id, false, deps)).toBeNull();
    await recordKept(record(false), deps);
    expect(deps.files.has(indexPath(PLUGIN_DIR))).toBe(true);
    expect(await findKept(apple.id, false, deps)).toEqual({
      path: record(false).path,
      width: 200,
      height: 180,
    });
    expect(await findKept(apple.id, true, deps)).toBeNull();
  });

  test('a kept file that is no longer a whole PNG is downloaded again', async () => {
    const deps = memory(false);
    await recordKept(record(false), deps);
    expect(await findKept(apple.id, false, deps)).toBeNull();
  });

  test('the Lookup store reuses a kept picture, read from the private folder', async () => {
    const files = new Map<string, string>();
    NativeModules.LookupFiles = {
      readText: jest.fn(async (path: string) => files.get(path) ?? null),
      writeText: jest.fn(async (path: string, text: string) => {
        files.set(path, text);
        return null;
      }),
      isCompletePng: jest.fn(async () => true),
    };
    (PluginManager as unknown as Record<string, unknown>).getPluginDirPath =
      jest.fn(async () => PLUGIN_DIR);
    await LOOKUP_PICTURES.record?.(record(false));
    expect([...files.keys()]).toEqual([indexPath(PLUGIN_DIR)]);
    expect(await LOOKUP_PICTURES.find?.(apple, false)).toMatchObject({
      path: record(false).path,
    });
  });
});

describe('the old synced folders (#23)', () => {
  test('counts the files left, names a folder that cannot be read, skips an empty one', async () => {
    const list = jest.fn(async (path: string) => {
      if (path.endsWith('Lookup/pictures')) {
        return ok([
          {name: 'a.png', bytes: 10},
          {name: 'b.png', bytes: 10},
        ]);
      }
      if (path.endsWith('Ink2Pic/library')) {
        return fail(-2, 'IO');
      }
      return ok(null);
    });
    expect(
      await oldFolders(list, '/storage/emulated/0/', async () => ok(new Set())),
    ).toEqual([
      {folder: 'MyStyle/Lookup/pictures', files: 2},
      {folder: 'MyStyle/Ink2Pic/library', files: null},
    ]);
    expect(list.mock.calls[0][0]).toBe(
      '/storage/emulated/0/MyStyle/Lookup/pictures',
    );
  });

  test('a fallback picture listed in pictures.json is never offered for deletion (#219)', async () => {
    const root = '/storage/emulated/0';
    const fallback = `${root}/MyStyle/Lookup/pictures/commons_Apple.png`;
    const list = jest.fn(async (path: string) =>
      path.endsWith('Lookup/pictures')
        ? ok([
            {name: 'commons_Apple.png', bytes: 10},
            {name: 'old.png', bytes: 10},
          ])
        : path.endsWith('Ink2Pic/symbols')
          ? ok([{name: '1F34E.png', bytes: 10}])
          : ok(null),
    );
    const symbols = {folder: 'MyStyle/Ink2Pic/symbols', files: 1};
    expect(await oldFolders(list, root, async () => ok(new Set([fallback])))).toEqual(
      [symbols],
    );
    // An index that cannot be read never lets the folder be offered as old.
    expect(
      await oldFolders(list, root, async () => fail(-2, 'IO')),
    ).toEqual([{folder: 'MyStyle/Lookup/pictures', files: null}, symbols]);
  });

  test('keptPaths lists every picture in pictures.json, from either folder', async () => {
    const files = new Map<string, string>([
      [
        indexPath(PLUGIN_DIR),
        JSON.stringify({
          a: {path: `${PLUGIN_DIR}/pictures/a.png`, width: 1, height: 1},
          b: {path: '/storage/emulated/0/MyStyle/Lookup/pictures/b.png', width: 1, height: 1},
        }),
      ],
    ]);
    const deps: LibraryDeps = {
      folder: async () => ok(PLUGIN_DIR),
      read: async path => ok(files.get(path) ?? null),
      write: async () => ok(null),
      complete: async () => ok(true),
    };
    const paths = await keptPaths(deps);
    expect(paths.ok && [...paths.value]).toEqual([
      `${PLUGIN_DIR}/pictures/a.png`,
      '/storage/emulated/0/MyStyle/Lookup/pictures/b.png',
    ]);
  });
});
