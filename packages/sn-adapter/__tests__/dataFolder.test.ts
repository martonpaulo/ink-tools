import {REGISTRY} from '../src';
import {pluginDataFolder} from '../src/official';

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
