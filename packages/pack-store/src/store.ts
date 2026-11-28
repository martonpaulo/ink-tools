/**
 * The one store of language packs on the tablet (#503), in the shared folder every Ink Tools tool
 * reads (#499). A pack is downloaded to a part file, checked by its size and SHA-256, moved to its
 * name and only then written in the installed catalog; a pack whose hash differs is deleted and
 * refused. Before each use a pack is checked by its hash again, then it works offline. The host
 * port holds every file and network call, so this module runs in tests with no device.
 */
import {
  InstalledCatalog,
  InstalledPack,
  PackResult,
  RemotePack,
  installedPack,
  packFail,
  packFileName,
  packOk,
  parseInstalledCatalog,
  serializeCatalog,
} from './catalog';
import {PACK_CATALOG_PATH, PACK_CONFIG, PACK_STORE_FOLDER} from './config';

/** A host call's own result: its value, or the host's message. */
export type HostResult<T> = {ok: true; value: T} | {ok: false; message: string};

/** The file and network calls the store needs; a plugin binds them to its native file module. */
export type PackHost = {
  /** Downloads `url` to `path`; the bytes written. */
  download: (url: string, path: string) => Promise<HostResult<number>>;
  /** The lowercase hex SHA-256 of the file at `path`. */
  sha256: (path: string) => Promise<HostResult<string>>;
  /** The file's size in bytes. */
  size: (path: string) => Promise<HostResult<number>>;
  /** Moves `from` to `to`, replacing `to`. */
  move: (from: string, to: string) => Promise<HostResult<null>>;
  /** Deletes the file; true when it is gone afterwards, also when it never existed. */
  remove: (path: string) => Promise<HostResult<boolean>>;
  /** The file's text, or `null` when it does not exist. */
  readText: (path: string) => Promise<HostResult<string | null>>;
  writeText: (path: string, text: string) => Promise<HostResult<null>>;
  /** Makes the folder when missing. */
  makeFolder: (path: string) => Promise<HostResult<null>>;
};

function hostFail(step: string, result: {ok: false; message: string}) {
  return packFail('HOST', `${step}: ${result.message}`);
}

/** The full path of a file in the store. */
export function storePath(file: string): string {
  return `${PACK_STORE_FOLDER}/${file}`;
}

/** The installed catalog. */
export async function readInstalled(host: PackHost): Promise<PackResult<InstalledCatalog>> {
  const text = await host.readText(PACK_CATALOG_PATH);
  return text.ok ? parseInstalledCatalog(text.value) : hostFail('read the catalog', text);
}

async function writeCatalog(host: PackHost, catalog: InstalledCatalog): Promise<PackResult<null>> {
  const part = `${PACK_CATALOG_PATH}${PACK_CONFIG.partSuffix}`;
  const written = await host.writeText(part, serializeCatalog(catalog));
  if (!written.ok) {
    return hostFail('write the catalog', written);
  }
  const moved = await host.move(part, PACK_CATALOG_PATH);
  return moved.ok ? packOk(null) : hostFail('replace the catalog', moved);
}

async function checkFile(
  host: PackHost,
  path: string,
  expected: {size: number; sha256: string},
): Promise<PackResult<null>> {
  const size = await host.size(path);
  if (!size.ok) {
    return hostFail('read the pack size', size);
  }
  if (size.value !== expected.size) {
    return packFail('SIZE_MISMATCH', `${path} holds ${size.value} bytes, the catalog says ${expected.size}`);
  }
  const hash = await host.sha256(path);
  if (!hash.ok) {
    return hostFail('hash the pack', hash);
  }
  if (hash.value.toLowerCase() !== expected.sha256) {
    return packFail('HASH_MISMATCH', `${path} has SHA-256 ${hash.value}, the catalog says ${expected.sha256}`);
  }
  return packOk(null);
}

/**
 * Downloads `pack` into the store, checks it and writes its catalog entry, replacing an older
 * version of the same language. The caller has shown the size and the user has said yes
 * (`download.ts`); this call asks nothing.
 */
export async function installPack(host: PackHost, pack: RemotePack): Promise<PackResult<InstalledPack>> {
  if (pack.size > PACK_CONFIG.maxPackBytes) {
    return packFail('TOO_LARGE', `${pack.language} ${pack.version} is ${pack.size} bytes, over the store's ${PACK_CONFIG.maxPackBytes}`);
  }
  const catalog = await readInstalled(host);
  if (!catalog.ok) {
    return catalog;
  }
  const folder = await host.makeFolder(PACK_STORE_FOLDER);
  if (!folder.ok) {
    return hostFail('make the store folder', folder);
  }
  const file = packFileName(pack);
  const part = storePath(`${file}${PACK_CONFIG.partSuffix}`);
  const downloaded = await host.download(pack.url, part);
  if (!downloaded.ok) {
    await host.remove(part);
    return hostFail('download the pack', downloaded);
  }
  const checked = await checkFile(host, part, pack);
  if (!checked.ok) {
    await host.remove(part);
    return checked;
  }
  const moved = await host.move(part, storePath(file));
  if (!moved.ok) {
    await host.remove(part);
    return hostFail('move the pack into the store', moved);
  }
  const {url: _url, ...entry} = pack;
  const installed: InstalledPack = {...entry, file};
  const older = installedPack(catalog.value, pack.language);
  const written = await writeCatalog(host, {
    packs: [...catalog.value.packs.filter(other => other.language !== pack.language), installed],
  });
  if (!written.ok) {
    return written;
  }
  if (older && older.file !== file) {
    // The catalog no longer names the older file, so a failed delete leaves only unused bytes;
    // the new pack is installed either way.
    await host.remove(storePath(older.file));
  }
  return packOk(installed);
}

/**
 * The installed pack of `language`, checked by its size and SHA-256 before use: its path, ready to
 * read offline. A pack whose bytes changed is refused, never read.
 */
export async function openPack(
  host: PackHost,
  language: string,
): Promise<PackResult<InstalledPack & {path: string}>> {
  const catalog = await readInstalled(host);
  if (!catalog.ok) {
    return catalog;
  }
  const pack = installedPack(catalog.value, language);
  if (!pack) {
    return packFail('NOT_INSTALLED', `no pack for ${language} is installed`);
  }
  const path = storePath(pack.file);
  const checked = await checkFile(host, path, pack);
  return checked.ok ? packOk({...pack, path}) : checked;
}

/** Deletes the pack of `language` and its catalog entry; the bytes freed. */
export async function removePack(host: PackHost, language: string): Promise<PackResult<number>> {
  const catalog = await readInstalled(host);
  if (!catalog.ok) {
    return catalog;
  }
  const pack = installedPack(catalog.value, language);
  if (!pack) {
    return packFail('NOT_INSTALLED', `no pack for ${language} is installed`);
  }
  const written = await writeCatalog(host, {packs: catalog.value.packs.filter(other => other !== pack)});
  if (!written.ok) {
    return written;
  }
  const removed = await host.remove(storePath(pack.file));
  return removed.ok && removed.value ? packOk(pack.size) : packFail('HOST', `delete ${pack.file}: ${removed.ok ? 'still there' : removed.message}`);
}
