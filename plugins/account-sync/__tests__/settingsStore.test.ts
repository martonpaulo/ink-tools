import {
  defaultSettings,
  serializeSettings,
  setModule,
} from '@supernote-tools/sync-core/settings';
import {ok, fail, THROWN_CODE} from '@supernote-tools/sn-adapter/official';
import {callFiles, TextFiles} from '../src/files';
import {loadSettings, saveSettings} from '../src/settingsStore';

const folder = async () => ok('/data/plugins/bridge/');

function disk(start: Record<string, string> = {}) {
  const files = {...start};
  const native: TextFiles = {
    readText: async p => files[p] ?? null,
    writeText: async (p, t) => {
      files[p] = t;
      return null;
    },
  };
  return {files, native};
}

test('the settings survive a restart: saved, then loaded from the private folder (#40)', async () => {
  const {files, native} = disk();
  const on = setModule(defaultSettings(), 'calendar', true);
  expect((await saveSettings(folder, on, native)).ok).toBe(true);
  expect(Object.keys(files)).toEqual(['/data/plugins/bridge/settings.json']);
  expect(await loadSettings(folder, native)).toEqual({ok: true, value: on});
});

test('no file is a first start; an unreadable file is a failure, never a silent reset', async () => {
  expect(await loadSettings(folder, disk().native)).toEqual({
    ok: true,
    value: defaultSettings(),
  });
  const broken = disk({'/data/plugins/bridge/settings.json': '{"schema": 9}'});
  const read = await loadSettings(folder, broken.native);
  expect(read.ok).toBe(false);
  expect(!read.ok && read.message).toMatch(/unreadable.*schema 9/);
});

test('a folder or module that fails is reported with its reason', async () => {
  const noFolder = async () =>
    fail(THROWN_CODE, 'getPluginDirPath returned nothing');
  expect(await loadSettings(noFolder, disk().native)).toMatchObject({
    ok: false,
    message: 'getPluginDirPath returned nothing',
  });
  expect(await callFiles(f => f.readText('/x'), undefined)).toMatchObject({
    ok: false,
    moduleCode: 'MISSING',
  });
  const refusing: TextFiles = {
    readText: async () => null,
    writeText: async () => {
      throw Object.assign(new Error('disk full'), {code: 'IO'});
    },
  };
  expect(await saveSettings(folder, defaultSettings(), refusing)).toMatchObject(
    {ok: false, message: 'disk full', moduleCode: 'IO'},
  );
  expect(serializeSettings(defaultSettings())).toContain('"schema":1');
});
