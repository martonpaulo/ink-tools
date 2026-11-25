/**
 * Lookup's PluginProfile and its entry into picture-search's device and insert tiers (#142):
 * every Lookup file imports the file store, the settings, the log and the insert from here, so
 * the profile is set before any call. Lookup's folder is `MyStyle/Lookup`, beside Ink2Pic's, and
 * its native modules are registered as `LookupFiles` and `LookupImage` by `LookupFilesPackage`
 * (native/), so both plugins installed side by side never share a folder or a module name.
 */
import {
  createSettingsStore,
  pluginPath,
  PluginProfile,
  setPluginProfile,
  SHARED_ROOT,
} from '@ink-tools/picture-search/storage';
import {version} from '../package.json';
import {versionCode} from '../PluginConfig.json';
import {LASSO_SETTINGS} from './settings';

export const REPOSITORY_URL = 'https://github.com/martonpaulo/ink-tools';

export const LOOKUP_PROFILE: PluginProfile = {
  name: 'Lookup',
  folder: 'MyStyle/Lookup',
  filesModule: 'LookupFiles',
  imageModule: 'LookupImage',
  // The User-Agent Wikimedia's policy asks for: the plugin, its version and a contact page.
  userAgent: `Lookup/${version} (+${REPOSITORY_URL})`,
  build: versionCode,
};

setPluginProfile(LOOKUP_PROFILE);

export * from '@ink-tools/picture-search/storage';
export * from '@ink-tools/picture-search/insert';

export const {getSettings, saveSettings, resetSettingsForTests} =
  createSettingsStore(LASSO_SETTINGS);

/** Lookup's own settings, as its searches read them (#306). */
export const getLookupSettings = async () => (await getSettings()).lookup;

/**
 * `<root>/MyStyle/Lookup/pictures`, where each prepared picture is written before it goes in the
 * note: the note app reads only shared storage (brief section 6.6).
 */
export function picturesDir(externalRoot = SHARED_ROOT): string {
  return pluginPath('pictures', externalRoot);
}
