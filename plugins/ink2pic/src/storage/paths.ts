/** The device's shared storage root, owned by sn-adapter (#101). */
import {SHARED_ROOT} from '@supernote-tools/sn-adapter/official';

export {SHARED_ROOT};

/** Where Ink2Pic keeps its files (brief section 6.6). */
export const SHARED_FOLDER = 'MyStyle/Ink2Pic';

/** `<root>/MyStyle/Ink2Pic/<name>`, a folder or a file. */
function sharedDir(externalRoot: string, folder: string): string {
  return `${externalRoot.replace(/\/+$/, '')}/${SHARED_FOLDER}/${folder}`;
}

/** `<root>/MyStyle/Ink2Pic/library`, where inserted pictures and library.json live. */
export function libraryDir(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'library');
}

/** The start of every temporary download's name in the private folder (#93). */
export const TEMPORARY_PREFIX = 'insert-';

/**
 * `<plugin folder>/insert-<result id>.<extension>`: the raw download of an insert, in the private
 * folder, where writing it needs no permission; PluginHost counts replacing a file in shared
 * storage as a delete (#62). Named per result, so two inserts at the same time never write one
 * file (#93); removed after the insert.
 */
export function insertDownloadPath(
  pluginDir: string,
  id: string,
  extension: string,
): string {
  return `${pluginDir}/${TEMPORARY_PREFIX}${safeFileName(id)}.${extension}`;
}

/**
 * `<plugin folder>/insert-early-<result id>.<extension>`: the full download «Insert best picture»
 * starts for the leading picture before page 1's order is known (#88); its own name, so a dropped
 * one never overwrites the winner's download (#93); removed once used or dropped.
 */
export function earlyDownloadPath(
  pluginDir: string,
  id: string,
  extension: string,
): string {
  return `${pluginDir}/${TEMPORARY_PREFIX}early-${safeFileName(
    id,
  )}.${extension}`;
}

/** True for a temporary download of `insertDownloadPath` or `earlyDownloadPath` in `pluginDir`. */
export function isTemporaryDownload(pluginDir: string, path: string): boolean {
  return (
    path.startsWith(`${pluginDir}/${TEMPORARY_PREFIX}`) &&
    !path.slice(pluginDir.length + 1).includes('/')
  );
}

/** A file name safe on the device: letters, digits, dot, dash and underscore only. */
export function safeFileName(name: string): string {
  return (
    name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
  );
}

/** `<root>/MyStyle/Ink2Pic/logs`, where the session log lives (#21). */
export function logsDir(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'logs');
}

/**
 * `<root>/MyStyle/Ink2Pic/settings.json`, the person's settings (#68): in shared storage, so a
 * plugin update keeps them, written in place (#62).
 */
export function settingsPath(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'settings.json');
}

/**
 * `<root>/MyStyle/Ink2Pic/picks.json`, the pictures the person chose per word (#34): in shared
 * storage, so a plugin update keeps them; one file, so a Supernote file sync checks one entry
 * (#23); written in place (#62).
 */
export function picksPath(externalRoot = SHARED_ROOT): string {
  return sharedDir(externalRoot, 'picks.json');
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
  return sharedDir(externalRoot, 'symbols');
}
