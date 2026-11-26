/**
 * Where Lookup keeps the pictures it inserted (#23, owner D13 B): `pictures/` of the private plugin
 * folder (`getPluginDirPath`), the one place a plugin reaches that Supernote file sync does not
 * read; each file in a synced folder costs about 0.14 s on every sync (docs/supernote.md › Files
 * and sync). `pictures.json` beside them gives each picture's size, so a picture used before is
 * inserted again from disk, with no network.
 * shortcut: the Ink2Pic brief records that an install empties the private folder (#41), so the
 * pictures are downloaded again after an update; keep them in shared storage only if the owner
 * wants them kept across updates.
 */
import {
  fail,
  ok,
  Result,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';
import {
  FileSize,
  InsertRecord,
  isCompletePng,
  KnownPicture,
  listSizes,
  log,
  logged,
  picturesDir,
  pluginFolder,
  readText,
  safeFileName,
  SHARED_ROOT,
  writeText,
} from './profile';

/** The private folder's subfolder that holds the inserted pictures. */
export const PICTURES_FOLDER = 'pictures';

/** `<plugin folder>/pictures`. */
export const privatePicturesDir = (pluginDir: string) =>
  `${pluginDir}/${PICTURES_FOLDER}`;

/** `<plugin folder>/pictures/pictures.json`, the size of each kept picture. */
export const indexPath = (pluginDir: string) =>
  `${privatePicturesDir(pluginDir)}/pictures.json`;

/** One kept picture, by result id and style. */
type Entry = {path: string; width: number | null; height: number | null};
type Index = Record<string, Entry>;

const key = (id: string, contour: boolean) =>
  `${safeFileName(id)}${contour ? '.contour' : ''}`;

export type LibraryDeps = {
  folder: () => Promise<Result<string>>;
  read: (path: string) => Promise<Result<string | null>>;
  write: (path: string, text: string) => Promise<Result<null>>;
  complete: (path: string) => Promise<Result<boolean>>;
};

const DEVICE: LibraryDeps = {
  folder: pluginFolder,
  read: readText,
  write: writeText,
  complete: isCompletePng,
};

/** The index, empty when the file does not exist yet; a failed or broken read is a failure. */
async function readIndex(
  deps: LibraryDeps,
): Promise<Result<{dir: string; index: Index}>> {
  const dir = await deps.folder();
  if (!dir.ok) {
    return dir;
  }
  const text = await deps.read(indexPath(dir.value));
  if (!text.ok) {
    return text;
  }
  try {
    const index = text.value === null ? {} : (JSON.parse(text.value) as Index);
    return ok({dir: dir.value, index});
  } catch (error) {
    return fail(THROWN_CODE, `pictures.json cannot be read: ${String(error)}`);
  }
}

/** The kept picture of this result in this style, when its file is still whole; else null. */
export async function findKept(
  id: string,
  contour: boolean,
  deps: LibraryDeps = DEVICE,
): Promise<KnownPicture | null> {
  const read = await readIndex(deps);
  if (!read.ok) {
    log(`pictures.json: ${read.message}`);
    return null;
  }
  const entry = read.value.index[key(id, contour)];
  if (!entry) {
    return null;
  }
  const whole = await deps.complete(entry.path);
  return whole.ok && whole.value ? entry : null;
}

/** Adds an inserted picture to the index; a failure is only logged: the picture is inserted. */
export async function recordKept(
  item: InsertRecord,
  deps: LibraryDeps = DEVICE,
): Promise<void> {
  const read = await readIndex(deps);
  if (!read.ok) {
    log(`pictures.json not updated: ${read.message}`);
    return;
  }
  const index: Index = {
    ...read.value.index,
    [key(item.id, item.contour)]: {
      path: item.path,
      width: item.width,
      height: item.height,
    },
  };
  const written = await logged('writeText(pictures.json)', () =>
    deps.write(indexPath(read.value.dir), JSON.stringify(index)),
  );
  if (!written.ok) {
    log(`pictures.json not updated: ${written.message}`);
  }
}

/** The paths of every picture in `pictures.json`, from either folder: the current build's own. */
export async function keptPaths(
  deps: LibraryDeps = DEVICE,
): Promise<Result<ReadonlySet<string>>> {
  const read = await readIndex(deps);
  if (!read.ok) {
    return read;
  }
  return ok(new Set(Object.values(read.value.index).map(entry => entry.path)));
}

/**
 * The synced folders earlier versions filled, one file each per picture or symbol: Lookup's own
 * `pictures` before #23, and Ink2Pic's library and symbols (#91), which Lookup replaces.
 * `MyStyle/Lookup/pictures` is also the live fallback of `insertKept`, so `oldFolders` leaves out
 * the pictures `pictures.json` lists (#219).
 */
export const OLD_FOLDERS = [
  'MyStyle/Lookup/pictures',
  'MyStyle/Ink2Pic/library',
  'MyStyle/Ink2Pic/symbols',
] as const;

/** An old folder with files left in it, or one that could not be read (`files` null). */
export type OldFolder = {folder: string; files: number | null};

/**
 * The old folders that Settings tells the person to delete: each holds files and none the current
 * build wrote (#219). Lookup's own folder (`picturesDir`), the fallback of `insertKept`, is left
 * out while it holds a picture in `pictures.json`, since deleting it would delete that picture
 * too; a missing folder is left out; a folder, or the index, that could not be read is named with
 * `files` null.
 */
export async function oldFolders(
  list: (path: string) => Promise<Result<FileSize[] | null>> = listSizes,
  root = SHARED_ROOT,
  kept: () => Promise<Result<ReadonlySet<string>>> = keptPaths,
): Promise<OldFolder[]> {
  const found: OldFolder[] = [];
  // Read once, and only when Lookup's own folder holds files.
  let inUse: Result<ReadonlySet<string>> | null = null;
  for (const folder of OLD_FOLDERS) {
    const path = `${root.replace(/\/+$/, '')}/${folder}`;
    const listed = await logged(`listSizes ${folder}`, () => list(path));
    if (!listed.ok) {
      found.push({folder, files: null});
      continue;
    }
    if (!listed.value || listed.value.length === 0) {
      continue;
    }
    if (path !== picturesDir(root)) {
      // Only Lookup's own folder is a live insert target; the Ink2Pic folders are never written.
      found.push({folder, files: listed.value.length});
      continue;
    }
    inUse = inUse ?? (await kept());
    if (!inUse.ok) {
      log(`old folders: pictures.json cannot be read, ${inUse.message}`);
      found.push({folder, files: null});
      continue;
    }
    const paths = inUse.value;
    const used = listed.value.filter(file => paths.has(`${path}/${file.name}`));
    if (used.length > 0) {
      log(`old folders: ${folder} holds ${used.length} pictures in use, not offered`);
      continue;
    }
    found.push({folder, files: listed.value.length});
  }
  return found;
}
