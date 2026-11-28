/**
 * The two catalogs of language packs (#503): the remote one lists what can be downloaded, and the
 * installed one, a file in the store, lists what is on the tablet. Both hold, per pack, its
 * language, version, size, SHA-256 and licence; this module reads and checks them at the boundary.
 */
import type {Outcome} from '@ink-tools/sn-adapter/official';

/** Why a pack call failed; the plugin's copy turns each into a plain sentence. */
export type PackErrorCode =
  | 'BAD_CATALOG'
  | 'TOO_LARGE'
  | 'SIZE_MISMATCH'
  | 'HASH_MISMATCH'
  | 'NOT_INSTALLED'
  | 'HOST';

export type PackFailure = {ok: false; code: PackErrorCode; message: string};
export type PackResult<T> = Outcome<T, PackFailure>;

export function packOk<T>(value: T): PackResult<T> {
  return {ok: true, value};
}

export function packFail(code: PackErrorCode, message: string): PackFailure {
  return {ok: false, code, message};
}

/** One pack, as both catalogs describe it. */
export type PackEntry = {
  /** The pack's language, a BCP 47 tag such as `en` or `pt-BR`. */
  language: string;
  /** The pack's own version, apart from any tool's version (#484). */
  version: string;
  /** Its size in bytes, shown to the user before the download. */
  size: number;
  /** The lowercase hex SHA-256 of its bytes. */
  sha256: string;
  /** The licence of its data, such as `CC BY-SA 4.0`. */
  licence: string;
};

/** A pack the remote catalog offers: the entry and where to download it. */
export type RemotePack = PackEntry & {url: string};

/** A pack in the store: the entry and its file name in the store's folder. */
export type InstalledPack = PackEntry & {file: string};

/** The installed catalog: one pack per language. */
export type InstalledCatalog = {packs: InstalledPack[]};

const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FILE = /^[a-z0-9][a-z0-9.+-]*\.pack$/i;

function entryProblem(raw: Record<string, unknown>): string | null {
  if (typeof raw.language !== 'string' || !LANGUAGE.test(raw.language)) {
    return 'language';
  }
  if (typeof raw.version !== 'string' || !VERSION.test(raw.version)) {
    return 'version';
  }
  if (typeof raw.size !== 'number' || !Number.isInteger(raw.size) || raw.size <= 0) {
    return 'size';
  }
  if (typeof raw.sha256 !== 'string' || !SHA256.test(raw.sha256)) {
    return 'sha256';
  }
  if (typeof raw.licence !== 'string' || !raw.licence.trim()) {
    return 'licence';
  }
  return null;
}

function entryOf(raw: Record<string, unknown>): PackEntry {
  return {
    language: raw.language as string,
    version: raw.version as string,
    size: raw.size as number,
    sha256: raw.sha256 as string,
    licence: raw.licence as string,
  };
}

function packsOf(text: string, what: string): PackResult<Record<string, unknown>[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return packFail('BAD_CATALOG', `${what} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const packs = (parsed as {packs?: unknown} | null)?.packs;
  if (!Array.isArray(packs) || !packs.every(pack => pack !== null && typeof pack === 'object')) {
    return packFail('BAD_CATALOG', `${what} has no list of packs`);
  }
  return packOk(packs as Record<string, unknown>[]);
}

/** The remote catalog's packs; one bad entry fails the whole catalog, so none is half trusted. */
export function parseRemoteCatalog(text: string): PackResult<RemotePack[]> {
  const packs = packsOf(text, 'the remote catalog');
  if (!packs.ok) {
    return packs;
  }
  const out: RemotePack[] = [];
  for (const [index, raw] of packs.value.entries()) {
    const problem = entryProblem(raw);
    if (problem) {
      return packFail('BAD_CATALOG', `the remote catalog's pack ${index} has no valid ${problem}`);
    }
    if (typeof raw.url !== 'string' || !raw.url.startsWith('https://')) {
      return packFail('BAD_CATALOG', `the remote catalog's pack ${index} has no https url`);
    }
    out.push({...entryOf(raw), url: raw.url});
  }
  return packOk(out);
}

/** The installed catalog; a missing file (`null`) is an empty store, a broken one a failure. */
export function parseInstalledCatalog(text: string | null): PackResult<InstalledCatalog> {
  if (text === null) {
    return packOk({packs: []});
  }
  const packs = packsOf(text, 'the installed catalog');
  if (!packs.ok) {
    return packs;
  }
  const out: InstalledPack[] = [];
  for (const [index, raw] of packs.value.entries()) {
    const problem = entryProblem(raw) ?? (typeof raw.file === 'string' && FILE.test(raw.file) ? null : 'file');
    if (problem) {
      return packFail('BAD_CATALOG', `the installed catalog's pack ${index} has no valid ${problem}`);
    }
    out.push({...entryOf(raw), file: raw.file as string});
  }
  return packOk({packs: out});
}

/** The installed catalog as its file holds it, sorted by language so a rewrite is stable. */
export function serializeCatalog(catalog: InstalledCatalog): string {
  const packs = [...catalog.packs].sort((a, b) => a.language.localeCompare(b.language));
  return `${JSON.stringify({packs}, null, 2)}\n`;
}

/** The store's file name of a pack: its language and version. */
export function packFileName(entry: PackEntry): string {
  return `${entry.language.toLowerCase()}-${entry.version}.pack`;
}

/** The installed pack of `language`, or none. */
export function installedPack(catalog: InstalledCatalog, language: string): InstalledPack | null {
  return catalog.packs.find(pack => pack.language === language) ?? null;
}
