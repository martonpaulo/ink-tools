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
 * A plugin's own folder in the hidden `.data/plugin/` (the registry's `pluginhost.file-sandbox`):
 * the one home of a plugin's files that inkctl or `adb shell` must reach, such as a request file, a
 * rendered page or a debug picture. The plugin file guard allows it and Supernote Cloud does not
 * sync it, while every file in `MyStyle/` is uploaded within seconds (#22, #148, #367). `name` is the
 * folder's name, `inktools-<plugin folder>`.
 */
export function pluginDataFolder(name: string): string {
  if (!/^inktools-[a-z0-9-]+$/.test(name)) {
    throw new Error(`pluginDataFolder: ${name} is not inktools-<plugin folder>`);
  }
  return `${SHARED_ROOT}/${REGISTRY.pluginhostFileSandbox.hiddenFolder}/${name}`;
}

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
