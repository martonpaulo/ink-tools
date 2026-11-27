import {REGISTRY} from '../src';
import type {SharedFolderDeps} from '../src/official';
import {
  fail,
  ok,
  pluginDataFolder,
  probeSharedFolder,
  SHARED_FOLDER,
  SHARED_FOLDER_PERMISSIONS,
  THROWN_CODE,
} from '../src/official';

/**
 * One owner for where a plugin keeps the files a tool or the shell reaches: its folder in the hidden
 * `.data/plugin/`, which Supernote Cloud does not sync, never a `MyStyle` folder (#22, #148, #367).
 */
describe('pluginDataFolder', () => {
  it('puts a plugin folder in the hidden .data/plugin/', () => {
    expect(pluginDataFolder('inktools-smart-pen')).toBe('/storage/emulated/0/.data/plugin/inktools-smart-pen');
  });

  it('refuses a name that could leave the folder or reach another one', () => {
    for (const bad of ['', '../MyStyle', 'inktools-a/b', 'Probe', 'inktools-']) {
      expect(() => pluginDataFolder(bad)).toThrow('is not inktools-<plugin folder>');
    }
  });

  it('is where the registry channels to inkctl live, none in a synced MyStyle folder', () => {
    expect(REGISTRY.storageHelperChannel.folder).toBe(pluginDataFolder('inktools-probe'));
    expect(REGISTRY.storageSignInDropFolder.folder).toBe(pluginDataFolder('inktools-account-sync'));
  });
});

/** The shared folder every plugin with the file permissions reads and writes (#499). */
describe('probeSharedFolder', () => {
  const entry = {path: `${SHARED_FOLDER}/my-languages.json`, folder: false};
  const deps = (over: Partial<SharedFolderDeps> = {}): SharedFolderDeps => ({
    has: async () => ok(true),
    make: async () => ok(true),
    list: async () => ok([entry]),
    ...over,
  });

  it('is named by the registry, in the hidden .data/plugin/ beside the plugin folders', () => {
    expect(SHARED_FOLDER).toBe(pluginDataFolder('inktools-shared'));
    expect(SHARED_FOLDER_PERMISSIONS).toEqual(['plugin.permission.FILE:READ', 'plugin.permission.FILE:WRITE']);
  });

  it('lists the folder when every permission is granted', async () => {
    expect(await probeSharedFolder(deps())).toEqual(ok({status: 'ready', folder: SHARED_FOLDER, entries: [entry]}));
  });

  it('names each missing permission, a failed check counted as missing, and touches no file', async () => {
    const make = jest.fn(async () => ok(true));
    const has = async (permission: string) =>
      permission.endsWith('WRITE') ? fail(THROWN_CODE, 'host closed') : ok(permission.endsWith('NONE'));
    expect(await probeSharedFolder(deps({has, make}))).toEqual(
      ok({status: 'needs', missing: ['plugin.permission.FILE:READ', 'plugin.permission.FILE:WRITE']}),
    );
    expect(make).not.toHaveBeenCalled();
  });

  it('fails, never answers an empty folder, when the folder is not made or not listed', async () => {
    expect(await probeSharedFolder(deps({make: async () => ok(false)}))).toEqual(
      fail(THROWN_CODE, `the shared folder ${SHARED_FOLDER} was not made`),
    );
    const refused = fail(THROWN_CODE, 'listFiles answered no folder listing');
    expect(await probeSharedFolder(deps({list: async () => refused}))).toEqual(refused);
  });
});
