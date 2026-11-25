/**
 * The settings store every plugin builds over its own codec (#68, #22, #94, #99), with the test
 * codec of testing/settings.ts. Ink2Pic's codec and folder stay in Ink2Pic's settings test
 * (#142, D63 A).
 */
import {NativeModules} from 'react-native';
import '../testing/profile';
import {
  defaultTestSettings,
  TEST_SETTINGS,
} from '../testing/settings';
import {
  conflictCopies,
  createSettingsStore,
  loadSettings,
  SettingsPlace,
  settingsPath,
} from '../src/storage';
import {logLines, startLog} from '../src/log/memory';
import type {TextStore} from '../src/cache';
import {fail, ok} from '@ink-tools/sn-adapter/official';

function memory(files: Record<string, string> = {}): TextStore {
  return {
    readText: async path => files[path] ?? null,
    writeText: async (path, text) => {
      files[path] = text;
    },
  };
}

const serialize = (size: 'small' | 'medium' | 'large') =>
  TEST_SETTINGS.serialize({size});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  startLog();
});

describe('the settings file (#68)', () => {
  it("logs each problem the plugin's codec finds", async () => {
    const path = '/s/settings.json';
    const storage = memory({[path]: '{"size": "huge"}'});
    expect(
      (await loadSettings(TEST_SETTINGS, storage, path, null)).settings,
    ).toEqual(defaultTestSettings());
    expect(logLines().join('\n')).toContain('settings: size "huge" is ignored');
  });

  it('keeps a file that is not JSON beside itself before any write (#94)', async () => {
    const path = '/s/settings.json';
    const broken = '{"size": "large",}';
    const files: Record<string, string> = {[path]: broken};
    const loaded = await loadSettings(TEST_SETTINGS, memory(files), path, null);
    expect(loaded).toEqual({
      settings: defaultTestSettings(),
      readFailure: null,
    });
    const copies = Object.keys(files).filter(name =>
      name.startsWith('/s/settings.unreadable-'),
    );
    expect(copies).toHaveLength(1);
    expect(files[copies[0]]).toBe(broken);
    expect(logLines().join('\n')).toContain(
      'is kept as /s/settings.unreadable-',
    );
  });

  it('refuses every write when the copy of a broken file cannot be kept (#94)', async () => {
    const storage: TextStore = {
      readText: async () => '[1, 2]',
      writeText: async () => {
        throw new Error('full');
      },
    };
    const loaded = await loadSettings(
      TEST_SETTINGS,
      storage,
      '/s/settings.json',
      null,
    );
    expect(loaded.readFailure).toContain('its copy could not be kept');
  });

  it('logs a failed read and uses the default', async () => {
    const storage: TextStore = {
      readText: async () => {
        throw new Error('EACCES');
      },
      writeText: async () => {},
    };
    expect(await loadSettings(TEST_SETTINGS, storage, '/x', null)).toEqual({
      settings: defaultTestSettings(),
      readFailure: 'Error: EACCES',
    });
    expect(logLines().join('\n')).toContain('settings: cannot read /x');
  });

  it('never writes the defaults over a file it could not read (#99)', async () => {
    const writeText = jest.fn(async () => null);
    NativeModules.TestFiles = {
      readText: jest.fn(async () => {
        throw Object.assign(new Error('busy'), {code: 'IO'});
      }),
      writeText,
    };
    const store = createSettingsStore(TEST_SETTINGS);
    expect((await store.getSettings()).size).toBe('medium');
    await store.saveSettings({size: 'small'});
    // The change lasts for the session; the file keeps the person's settings.
    expect((await store.getSettings()).size).toBe('small');
    expect(writeText).not.toHaveBeenCalled();
    expect(logLines().join('\n')).toContain(
      `settings: cannot read ${settingsPath()}: IO: busy`,
    );
    expect(logLines().join('\n')).toContain('settings: not saved');
    // The next runtime reads the file again and saves as before.
    NativeModules.TestFiles.readText = jest.fn(async () => serialize('large'));
    store.resetSettingsForTests();
    expect((await store.getSettings()).size).toBe('large');
    await store.saveSettings({size: 'small'});
    expect(writeText).toHaveBeenCalledTimes(1);
    delete NativeModules.TestFiles;
  });

  it("keeps a change across a restart, written to the profile's folder", async () => {
    const files: Record<string, string> = {};
    NativeModules.TestFiles = {
      readText: jest.fn(async (path: string) => files[path] ?? null),
      writeText: jest.fn(async (path: string, text: string) => {
        files[path] = text;
        return null;
      }),
    };
    const store = createSettingsStore(TEST_SETTINGS);
    expect((await store.getSettings()).size).toBe('medium');
    await store.saveSettings({size: 'large'});
    expect(settingsPath()).toBe(
      '/storage/emulated/0/MyStyle/Test/settings.json',
    );
    expect(Object.keys(files)).toEqual([settingsPath()]);
    // A new runtime reads the file again.
    store.resetSettingsForTests();
    expect((await store.getSettings()).size).toBe('large');
    delete NativeModules.TestFiles;
  });
});

describe('settings live in the private folder, out of MyStyle (#22)', () => {
  const ROOT = '/storage/emulated/0';
  const PRIVATE = '/data/plugins/test';
  const OWN = `${PRIVATE}/settings.json`;
  const SHARED = `${ROOT}/MyStyle/Test/settings.json`;
  const large = serialize('large');
  const small = serialize('small');

  function place(
    files: Record<string, string>,
    names: string[] | null = null,
    dir = ok(PRIVATE),
  ): SettingsPlace & {written: string[]} {
    const written: string[] = [];
    return {
      written,
      storage: {
        readText: async path => files[path] ?? null,
        writeText: async (path, text) => {
          written.push(path);
          files[path] = text;
        },
      },
      privateDir: async () => dir,
      listDir: async () => ok(names),
      sharedRoot: ROOT,
    };
  }

  it('moves the shared file into the private folder once, and never writes in MyStyle again', async () => {
    const files: Record<string, string> = {[SHARED]: large};
    const where = place(files);
    const store = createSettingsStore(TEST_SETTINGS, where);
    expect((await store.getSettings()).size).toBe('large');
    expect(files[OWN]).toBe(large);
    await store.saveSettings({size: 'small'});
    expect(where.written).toEqual([OWN, OWN]);
    // The shared file is left as it was; the next runtime reads the private one.
    expect(files[SHARED]).toBe(large);
    store.resetSettingsForTests();
    expect((await store.getSettings()).size).toBe('small');
    expect(where.written).toEqual([OWN, OWN]);
  });

  it('reads the newest conflict copy when the shared file is gone', async () => {
    const old = `${ROOT}/MyStyle/Test_CONFLICT_20261109223635230/settings.json`;
    const newer = `${ROOT}/MyStyle/Test_CONFLICT_20261110080000000/settings.json`;
    const files: Record<string, string> = {[old]: small, [newer]: large};
    const names = [
      'Test',
      'Test_CONFLICT_20261109223635230',
      'Test_CONFLICT_20261110080000000',
      'Lookup_CONFLICT_20261111000000000',
    ];
    const store = createSettingsStore(TEST_SETTINGS, place(files, names));
    expect((await store.getSettings()).size).toBe('large');
    expect(files[OWN]).toBe(large);
    expect(logLines().join('\n')).toContain(`settings: moved from ${newer}`);
  });

  it('keeps the shared path with no private folder, and the defaults with no file anywhere', async () => {
    const files: Record<string, string> = {[SHARED]: large};
    const shared = place(files, null, fail(1, 'no dir'));
    const store = createSettingsStore(TEST_SETTINGS, shared);
    expect((await store.getSettings()).size).toBe('large');
    await store.saveSettings({size: 'small'});
    expect(shared.written).toEqual([SHARED]);

    const empty = place({});
    const fresh = createSettingsStore(TEST_SETTINGS, empty);
    expect(await fresh.getSettings()).toEqual(defaultTestSettings());
    expect(empty.written).toEqual([]);
  });

  it("conflictCopies takes only this folder's copies, newest first", () => {
    expect(
      conflictCopies('Test', [
        'Test_CONFLICT_20261109223635230',
        'Test_CONFLICT_2026',
        'Test_CONFLICT_20261201000000000',
        'Testx_CONFLICT_20261201000000000',
      ]),
    ).toEqual(['Test_CONFLICT_20261201000000000', 'Test_CONFLICT_20261109223635230']);
  });
});
