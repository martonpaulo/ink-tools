import {FileUtils} from 'sn-plugin-lib';
import {REGISTRY} from '../registry.generated';
import {hasPermission} from './plugin';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

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
 * Where a sticker collection goes, and its extension (the registry's `pluginhost.file-sandbox`,
 * #35): the Sticker plugin's «Import» lists `.snstk` collections in this folder, not a lone
 * `.sticker` (docs/supernote.md › Files and sync).
 */
export const STICKER_COLLECTION_FOLDER = `${SHARED_ROOT}/${REGISTRY.pluginhostFileSandbox.stickerCollectionFolder}`;
export const STICKER_COLLECTION_EXTENSION: string = REGISTRY.pluginhostFileSandbox.stickerCollectionExtension;

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

/** One entry of a folder: its full path, and whether it is a folder. */
export type FolderEntry = {path: string; folder: boolean};

/**
 * The entries straight in the folder at `path` (official `FileUtils.listFiles`, #451). sn-plugin-lib
 * 0.2.3 answers `{path, type}` per entry, type 0 a folder, and null for an empty folder
 * (docs/supernote.md); a missing folder is a failure.
 */
export async function listFolder(path: string): Promise<Result<FolderEntry[]>> {
  return attempt(
    () => FileUtils.listFiles(path),
    raw => {
      if (raw === null || raw === undefined) {
        return ok([]);
      }
      const entries = Array.isArray(raw) ? (raw as {path?: unknown; type?: unknown}[]) : null;
      if (!entries || !entries.every(entry => typeof entry?.path === 'string' && (entry.type === 0 || entry.type === 1))) {
        return fail(THROWN_CODE, `listFiles answered no folder listing for ${path}`);
      }
      return ok(entries.map(entry => ({path: entry.path as string, folder: entry.type === 0})));
    },
  );
}

/**
 * The Ink Tools shared folder (the registry's `storage.shared-folder`, #499): the one home of the
 * values the tools share, such as My languages and the language packs (#502, #503). Two plugins
 * with different plugin ids each created, wrote, read and listed it on the Manta, so no plugin
 * depends on another to reach what that one wrote; Supernote Cloud does not sync `.data/plugin/`.
 */
export const SHARED_FOLDER: string = REGISTRY.storageSharedFolder.folder;

/** The permissions a plugin needs to use the shared folder, declared in the registry, not here. */
export const SHARED_FOLDER_PERMISSIONS: readonly string[] = REGISTRY.storageSharedFolder.permissions;

/** Whether this plugin can use the shared folder now: ready with its entries, or the permissions it misses. */
export type SharedFolderState =
  | {status: 'ready'; folder: string; entries: FolderEntry[]}
  | {status: 'needs'; missing: string[]};

export type SharedFolderDeps = {
  has: (permission: string) => Promise<Result<boolean>>;
  make: (path: string) => Promise<Result<boolean>>;
  list: (path: string) => Promise<Result<FolderEntry[]>>;
};

const SHARED_FOLDER_DEVICE: SharedFolderDeps = {has: hasPermission, make: makeFolder, list: listFolder};

/**
 * The shared folder's probe (`storage.shared-folder`'s `probe`): every permission the registry
 * lists that is not granted, a failed check counted as not granted, so a screen shows the exact
 * missing one in its Needs state (#245); with all granted, the folder made when missing and listed.
 * A folder that is not made or not listed is a failure that names it, never an empty list.
 */
export async function probeSharedFolder(
  deps: SharedFolderDeps = SHARED_FOLDER_DEVICE,
): Promise<Result<SharedFolderState>> {
  const missing: string[] = [];
  for (const permission of SHARED_FOLDER_PERMISSIONS) {
    const held = await deps.has(permission);
    if (!(held.ok && held.value)) {
      missing.push(permission);
    }
  }
  if (missing.length) {
    return ok({status: 'needs', missing});
  }
  const made = await deps.make(SHARED_FOLDER);
  if (!made.ok) {
    return made;
  }
  if (!made.value) {
    return fail(THROWN_CODE, `the shared folder ${SHARED_FOLDER} was not made`);
  }
  const entries = await deps.list(SHARED_FOLDER);
  return entries.ok ? ok({status: 'ready', folder: SHARED_FOLDER, entries: entries.value}) : entries;
}
