/**
 * Ink2Pic's PluginProfile and its entry into picture-search's device tier (#142): every Ink2Pic
 * file imports the file store, the settings, the session log, the run log and the lasso read and
 * placement from here, so the profile is set before any call. Ink2Pic's own folders (the library, the picks, the symbols) are
 * here too; the tier knows only the folder.
 */
import {
  createSettingsStore,
  pluginPath,
  PluginProfile,
  setPluginProfile,
  SettingsCodec,
  SHARED_ROOT,
} from '@supernote-tools/picture-search/storage';
import {USER_AGENT} from './config';
import {parseSettings, serializeSettings, Settings} from './settings/settings';

/** Where Ink2Pic keeps its files (brief section 6.6): never changed, the person's files are there. */
export const SHARED_FOLDER = 'MyStyle/Ink2Pic';

export const INK2PIC_PROFILE: PluginProfile = {
  name: 'Ink2Pic',
  folder: SHARED_FOLDER,
  // Ink2PicFilesPackage's no-argument constructor registers these two names.
  filesModule: 'Ink2PicFiles',
  imageModule: 'Ink2PicImage',
  userAgent: USER_AGENT,
};

setPluginProfile(INK2PIC_PROFILE);

export * from '@supernote-tools/picture-search/storage';
export * from '@supernote-tools/picture-search/insert';

/** How `settings.json` is read and written (#68). */
export const INK2PIC_SETTINGS: SettingsCodec<Settings> = {
  parse: parseSettings,
  serialize: serializeSettings,
  describe: settings => `languages ${settings.languages.join(', ')}`,
};

export const {getSettings, saveSettings, resetSettingsForTests} =
  createSettingsStore(INK2PIC_SETTINGS);

/** `<root>/MyStyle/Ink2Pic/library`, where inserted pictures and library.json live. */
export function libraryDir(externalRoot = SHARED_ROOT): string {
  return pluginPath('library', externalRoot);
}

/**
 * `<root>/MyStyle/Ink2Pic/picks.json`, the pictures the person chose per word (#34): in shared
 * storage, so a plugin update keeps them; one file, so a Supernote file sync checks one entry
 * (#23); written in place (#62).
 */
export function picksPath(externalRoot = SHARED_ROOT): string {
  return pluginPath('picks.json', externalRoot);
}

/** The hidden folder of the offline symbols, as the person sees it on the tablet (#23). */
export const SYMBOLS_FOLDER = '.ink2pic-symbols';

/**
 * `<root>/.ink2pic-symbols`, the OpenMoji pictures kept for offline use (#91), one `<hex>.png`
 * each, written in place (#62). A hidden folder outside `MyStyle/`, which Supernote file sync does
 * not read: each file in a synced folder costs about 0.14 s on every sync, so 1,447 symbols cost
 * about 4 minutes; the owner's hand-moved copy is at this exact path (#23).
 */
export function symbolsDir(externalRoot = SHARED_ROOT): string {
  return `${externalRoot.replace(/\/+$/, '')}/${SYMBOLS_FOLDER}`;
}

/** `MyStyle/Ink2Pic/symbols`, as Settings names the old folder to the person (#23). */
export const OLD_SYMBOLS_FOLDER = `${SHARED_FOLDER}/symbols`;

/**
 * `<root>/MyStyle/Ink2Pic/symbols`, where symbols were kept before #23: Supernote syncs it. Read
 * only, never written or deleted: a symbol left there is still used, and the person deletes the
 * folder with the file manager.
 */
export function oldSymbolsDir(externalRoot = SHARED_ROOT): string {
  return pluginPath('symbols', externalRoot);
}
