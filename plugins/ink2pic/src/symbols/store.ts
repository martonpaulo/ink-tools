/**
 * OpenMoji pictures kept on the device for offline use (#91): each symbol shown or inserted is
 * saved once as `.ink2pic-symbols/<hex>.png`, a hidden folder Supernote file sync does not read
 * (#23), and Settings can download every one. Symbols left in the old synced folder,
 * `MyStyle/Ink2Pic/symbols`, are still read, never written. Shared storage is written in place by
 * the plugin's own module (#62). Nothing here deletes a file: PluginHost counts a delete in shared
 * storage as FILE:DELETE, which Ink2Pic does not declare.
 */
import {log, logged} from '../log/memory';
import {
  networkDown,
  openmojiPictureUrl,
  SearchOutcome,
  SearchResult,
  sourceId,
  symbolHexes,
} from '@supernote-tools/picture-search';
import {
  downloadThumbToFile,
  FileSize,
  isCompletePng,
  listCompletePngs,
  listSizes,
} from '../storage/files';
import {oldSymbolsDir, symbolsDir} from '../storage/paths';

const EXTENSION = '.png';
const FILE_PREFIX = 'file://';
/** Requests at a time for «Download symbols»: polite to raw.githubusercontent.com. */
export const DOWNLOAD_PARALLEL = 3;
/** 1,447 PNGs at 618 px measured about 15 MB (#91): 10.4 KB each on average. */
export const SYMBOL_BYTES = 10400;
const BYTES_PER_MB = 1000 * 1000;

/** The saved symbols' codes, in either folder; null until the folders are listed. */
let saved: Set<string> | null = null;
/** Saved symbols found only in the old synced folder, read from there (#23). */
const oldOnly = new Set<string>();
/** The symbol files in the old synced folder, for Settings' note (#23). */
let oldCount = 0;
let listing: Promise<Set<string>> | null = null;
/** Saved symbols whose file was checked whole this session, or downloaded whole (#102). */
const whole = new Set<string>();
/** Settings' whole-folder check, once per session (#102). */
let checkedAll: Promise<Set<string>> | null = null;
/** Why the last listing failed, or null; Settings names it (#99). */
let unlisted: string | null = null;
/** One download per symbol: a second request for the same one joins the first. */
const pending = new Map<string, Promise<boolean>>();

/** Where a symbol is written: always the hidden folder (#23). */
export function symbolPath(hex: string): string {
  return `${symbolsDir()}/${hex}${EXTENSION}`;
}

/** Where a saved symbol is read: the hidden folder, else the old one it was found in (#23). */
function foundPath(hex: string): string {
  return oldOnly.has(hex) ? `${oldSymbolsDir()}/${hex}${EXTENSION}` : symbolPath(hex);
}

/** The non-empty PNGs of a listing, by code. */
function pngHexes(files: FileSize[]): string[] {
  return files
    .filter(file => file.name.endsWith(EXTENSION) && file.bytes > 0)
    .map(file => file.name.slice(0, -EXTENSION.length));
}

function isSymbol(result: SearchResult): boolean {
  return result.source === 'openmoji';
}

/**
 * The saved symbols, listed once per session by name and size, with no file opened (#102): every
 * non-empty PNG of the hidden folder, then of the old synced one (#23). A file a cut-off download
 * left is listed too; `isWhole` checks the one about to be used (#91), and Settings checks the
 * whole folders with `completeSymbols`.
 * A folder that cannot be listed is not cached as empty (#99): this call gets no symbol, its
 * pictures come from the network, and the next call lists the folders again.
 */
export function savedSymbols(): Promise<Set<string>> {
  if (saved) {
    return Promise.resolve(saved);
  }
  listing ??= (async () => {
    const files: FileSize[][] = [];
    for (const dir of [symbolsDir(), oldSymbolsDir()]) {
      const listed = await logged(`listSizes ${dir}`, () => listSizes(dir));
      if (!listed.ok) {
        log(`symbols: cannot list ${dir}: ${listed.message}`);
        unlisted = listed.message;
        listing = null;
        return new Set<string>();
      }
      files.push(listed.value ?? []);
    }
    unlisted = null;
    const found = new Set(pngHexes(files[0]));
    const inOld = pngHexes(files[1]);
    oldCount = inOld.length;
    oldOnly.clear();
    for (const hex of inOld) {
      if (!found.has(hex)) {
        oldOnly.add(hex);
        found.add(hex);
      }
    }
    if (oldCount > 0) {
      log(`symbols: ${oldCount} still in ${oldSymbolsDir()}, read only (#23)`);
    }
    saved = found;
    return saved;
  })();
  return listing;
}

/**
 * Whether a listed symbol's file is a whole PNG, checked once per session, just before it is
 * shown or inserted (#102); a file that is not leaves the saved set, so it is downloaded again.
 */
async function isWhole(hex: string): Promise<boolean> {
  if (whole.has(hex)) {
    return true;
  }
  const checked = await logged(`isCompletePng ${hex}`, () =>
    isCompletePng(foundPath(hex)),
  );
  if (checked.ok && checked.value) {
    whole.add(hex);
    return true;
  }
  saved?.delete(hex);
  oldOnly.delete(hex);
  log(`symbols: ${hex} is not a whole PNG; not used`);
  return false;
}

/**
 * The saved symbols whose file is a whole PNG, each folder checked in one call, once per session:
 * for Settings, whose count and «Download symbols» must never count a cut-off file (#91). The
 * search lists with `savedSymbols` and opens no file (#102). A folder that cannot be checked
 * keeps the listing.
 */
function completeSymbols(): Promise<Set<string>> {
  checkedAll ??= (async () => {
    const known = await savedSymbols();
    if (unlisted !== null) {
      // Not listed: nothing to check, and the next call tries again (#99).
      checkedAll = null;
      return known;
    }
    const wholeIn = async (dir: string): Promise<Set<string> | null> => {
      const checked = await logged(`listCompletePngs ${dir}`, () =>
        listCompletePngs(dir),
      );
      if (!checked.ok) {
        log(`symbols: cannot check ${dir}: ${checked.message}`);
        return null;
      }
      return new Set(
        (checked.value ?? [])
          .filter(name => name.endsWith(EXTENSION))
          .map(name => name.slice(0, -EXTENSION.length)),
      );
    };
    const hidden = await wholeIn(symbolsDir());
    const old = oldOnly.size > 0 ? await wholeIn(oldSymbolsDir()) : new Set();
    if (!hidden || !old) {
      return known;
    }
    for (const hex of [...known]) {
      if ((oldOnly.has(hex) ? old : hidden).has(hex)) {
        whole.add(hex);
      } else if (!whole.has(hex)) {
        known.delete(hex);
        oldOnly.delete(hex);
      }
    }
    return known;
  })();
  return checkedAll;
}

/** The saved picture of an OpenMoji result, known from this session's listing; else null. */
export function savedSymbolPath(result: SearchResult): string | null {
  const hex = sourceId(result.id);
  return isSymbol(result) && saved?.has(hex) ? foundPath(hex) : null;
}

/**
 * The `file://` URI of a saved symbol, else null: the one place a tile reads it, before any
 * thumbnail store, so a saved symbol shows offline with the plugin folder unlisted (#99).
 */
export function savedSymbolUri(result: SearchResult): string | null {
  const path = savedSymbolPath(result);
  return path ? `${FILE_PREFIX}${path}` : null;
}

/**
 * As `savedSymbolPath`, listing the folder first when this session has not, and only when the
 * file is a whole PNG: the insert's saved picture (#91, #102).
 */
export async function symbolFile(result: SearchResult): Promise<string | null> {
  if (!isSymbol(result)) {
    return null;
  }
  await savedSymbols();
  const path = savedSymbolPath(result);
  return path && (await isWhole(sourceId(result.id))) ? path : null;
}

/**
 * Downloads one symbol into the hidden folder unless either folder holds it whole; true when it
 * is saved afterwards (#23). In
 * the background lane, so an insert never waits behind it (#46). A download cut off midway leaves
 * a partial file in place, which is never counted: the file must end with the PNG's IEND chunk,
 * checked here and again by each session's listing; the next save writes over it.
 */
function save(hex: string): Promise<boolean> {
  const running = pending.get(hex);
  if (running) {
    return running;
  }
  const started = (async () => {
    const known = await savedSymbols();
    if (known.has(hex) && (await isWhole(hex))) {
      return true;
    }
    const path = symbolPath(hex);
    const bytes = await logged(`symbol ${hex}`, () =>
      downloadThumbToFile(openmojiPictureUrl(hex), path),
    );
    if (!bytes.ok) {
      return false;
    }
    const complete = await logged(`isCompletePng ${hex}`, () =>
      isCompletePng(path),
    );
    if (!complete.ok || !complete.value) {
      log(`symbols: ${hex} is not a whole PNG; not saved`);
      return false;
    }
    known.add(hex);
    oldOnly.delete(hex);
    whole.add(hex);
    return true;
  })().finally(() => pending.delete(hex));
  pending.set(hex, started);
  return started;
}

/** Saves an OpenMoji result's picture once, after it was shown or inserted. Never rejects. */
export async function saveSymbol(result: SearchResult): Promise<void> {
  if (isSymbol(result)) {
    await save(sourceId(result.id)).catch(error =>
      log(`symbols: save ${result.id} failed: ${String(error)}`),
    );
  }
}

/**
 * The grid's picture of an OpenMoji result: the saved file, downloaded into the folder first when
 * missing; the web URL when that failed.
 */
export async function symbolUri(result: SearchResult): Promise<string> {
  const hex = sourceId(result.id);
  return (await save(hex).catch(() => false))
    ? `${FILE_PREFIX}${foundPath(hex)}`
    : result.thumbUrl;
}

/**
 * Marks each OpenMoji result whose picture is saved with `offlinePicture`; with no network, drops
 * the OpenMoji results without it, whose pictures cannot show (#91).
 */
export async function markSavedSymbols(
  outcome: SearchOutcome,
): Promise<SearchOutcome> {
  if (!outcome.results.some(isSymbol)) {
    return outcome;
  }
  await savedSymbols();
  const offline = networkDown(outcome);
  if (offline) {
    // Without the network a cut-off file could not be replaced: check each one shown (#102).
    for (const result of outcome.results) {
      if (savedSymbolPath(result)) {
        await isWhole(sourceId(result.id));
      }
    }
  }
  const marked = outcome.results.map(result =>
    savedSymbolPath(result)
      ? {...result, offlinePicture: true as const}
      : result,
  );
  return {
    ...outcome,
    results: offline
      ? marked.filter(result => !isSymbol(result) || result.offlinePicture)
      : marked,
  };
}

/**
 * How many symbols exist and how many are saved, for Settings; `unreadable` when a folder could
 * not be listed, so the saved count is unknown, not zero (#99); `oldFiles`, the symbol files
 * still in the old synced folder, when there are any (#23).
 */
export type SymbolsStatus = {
  total: number;
  saved: number;
  unreadable?: true;
  oldFiles?: number;
};

/** The `unreadable` and `oldFiles` parts of a status, each only when it applies. */
function folderState(): Pick<SymbolsStatus, 'unreadable' | 'oldFiles'> {
  return {
    ...(unlisted !== null && {unreadable: true as const}),
    ...(unlisted === null && oldCount > 0 && {oldFiles: oldCount}),
  };
}

export async function symbolsStatus(): Promise<SymbolsStatus> {
  const known = await completeSymbols();
  const all = symbolHexes();
  return {
    total: all.length,
    saved: all.filter(hex => known.has(hex)).length,
    ...folderState(),
  };
}

/** The download size of the missing symbols, in whole megabytes, at least 1 when any is missing. */
export function missingMegabytes(status: SymbolsStatus): number {
  const missing = status.total - status.saved;
  return missing > 0
    ? Math.max(1, Math.round((missing * SYMBOL_BYTES) / BYTES_PER_MB))
    : 0;
}

/**
 * Failed downloads in a row, with no symbol saved between them, that stop «Download symbols»: the
 * network is gone, not one symbol. DEFAULT, no device measurement yet.
 */
export const STOP_AFTER_FAILURES = 10;

/**
 * The end of «Download symbols»: `failed` symbols were skipped (#104); `stopped` when
 * `STOP_AFTER_FAILURES` failed in a row and the rest was not tried.
 */
export type SymbolsDownload = SymbolsStatus & {
  complete: boolean;
  failed: number;
  stopped: boolean;
};

/**
 * Downloads every missing symbol, `DOWNLOAD_PARALLEL` at a time, reporting the saved count after
 * each. A symbol that fails is skipped, logged and counted, and the rest go on (#104); after
 * `STOP_AFTER_FAILURES` failures in a row it stops, so no network means a few failed requests, not
 * 1,447. A new run resumes from the files already saved and tries the failed ones again. Never
 * rejects.
 */
export async function downloadAllSymbols(
  onProgress: (status: SymbolsStatus) => void,
): Promise<SymbolsDownload> {
  const known = await completeSymbols();
  const all = symbolHexes();
  if (unlisted !== null) {
    // The saved ones are unknown: downloading all 1,447 again is not the answer (#99).
    log('symbols: the folder cannot be listed; no download');
    return {
      total: all.length,
      saved: 0,
      unreadable: true,
      complete: false,
      failed: 0,
      stopped: true,
    };
  }
  const missing = all.filter(hex => !known.has(hex));
  let done = all.length - missing.length;
  const failed: string[] = [];
  let inARow = 0;
  let next = 0;
  log(`symbols: downloading ${missing.length} of ${all.length}`);
  const worker = async () => {
    while (inARow < STOP_AFTER_FAILURES && next < missing.length) {
      const hex = missing[next++];
      if (await save(hex).catch(() => false)) {
        inARow = 0;
        done += 1;
        onProgress({total: all.length, saved: done});
      } else {
        inARow += 1;
        failed.push(hex);
        log(`symbols: ${hex} failed; skipped`);
      }
    }
  };
  await Promise.all(Array.from({length: DOWNLOAD_PARALLEL}, worker));
  const stopped = next < missing.length;
  log(
    `symbols: ${done} of ${all.length} saved, ${failed.length} failed` +
      (stopped ? `, stopped after ${STOP_AFTER_FAILURES} in a row` : ''),
  );
  return {
    total: all.length,
    saved: done,
    ...folderState(),
    complete: done === all.length,
    failed: failed.length,
    stopped,
  };
}

export function resetSymbolsForTests(): void {
  saved = null;
  listing = null;
  oldOnly.clear();
  oldCount = 0;
  whole.clear();
  checkedAll = null;
  unlisted = null;
  pending.clear();
}
