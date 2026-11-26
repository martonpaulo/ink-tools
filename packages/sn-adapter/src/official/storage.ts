import {FileUtils} from 'sn-plugin-lib';
import {REGISTRY} from '../registry.generated';
import {attempt, ok, Result} from './result';

/**
 * The device's shared storage root, as the host's own paths show it (`getCurrentFilePath` answered
 * `/storage/emulated/0/Note/...` on the Manta, Ink2Pic builds 0.1.0 (3) to (8)). Not read through
 * FileUtils.getExternalDirPath: its module can close the plugin on an error (Ink2Pic #13). Each
 * plugin names its own folders under it; a firmware that moves the root changes only this line.
 */
export const SHARED_ROOT = '/storage/emulated/0';

/**
 * The shared folders whose `.sticker` files the built-in Sticker plugin's import lists (the
 * registry's `pluginhost.file-sandbox`, #35): a sticker a plugin keeps there is found again.
 */
export const STICKER_IMPORT_FOLDERS: readonly string[] =
  REGISTRY.pluginhostFileSandbox.stickerImportFolders;

/**
 * Makes the folder at `path` when it is missing (official `FileUtils.exists` and `makeDir`);
 * `true` when it exists afterwards.
 */
export async function makeFolder(path: string): Promise<Result<boolean>> {
  return attempt(
    async () => (await FileUtils.exists(path)) || (await FileUtils.makeDir(path)),
    raw => ok(raw === true),
  );
}
