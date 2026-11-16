/**
 * Before page 1 shows: the thumbnails of pages 1 and 2 are downloaded to their files, measured
 * in Java, and those results re-sorted by their pixels (#66, research note
 * 2026-11-search-ranking section 7). A dark picture or a photo is turned into a contour drawing
 * on its thumbnail too, measured as converted, and inserted converted: what the person sees is
 * what goes in (owner decision D5 A). Bounded in time: what is not measured by then keeps its
 * place and its look. Every kind and time is logged.
 *
 * Page 3 and later: each thumbnail is measured, and converted when it needs it, as its page
 * loads, before the page shows; their order stays as it is (#72).
 *
 * Moved from Ink2Pic for every plugin that inserts the best picture (#142): the plugin hands in
 * its analyzer, its thumbnail store and its style as `MeasureDeps`.
 */
import {log} from '../log/memory';
import {pickId, picksFirst} from '../picks';
import {
  chooseLook,
  ImageAnalyzer,
  leaderDecided,
  lineArt,
  MEASURED_RESULTS,
  Measures,
  orderMeasured,
  pixelKind,
  Prepared,
} from '../measures';
import {withinLimit} from '../clock';
import {
  CONTOUR_SUFFIX,
  DARKENED_SUFFIX,
  storeDerived,
  THUMB_TIMEOUT_MS,
  thumbPath,
} from './thumbs';
import type {SearchResult} from '../types';

/**
 * At most this long for the downloads and measures, the grid's own limit for a page: page 1
 * waits for pages 1 and 2 at most that long.
 */
export const MEASURE_LIMIT_MS = THUMB_TIMEOUT_MS;
/**
 * At most this long for a later page's measure and conversion, after its download, so the page
 * shows within the grid's limit (THUMB_TIMEOUT_MS). DEFAULT: TO TEST on the device.
 */
export const LATER_MEASURE_LIMIT_MS = 2000;
const FILE_PREFIX = 'file://';
/**
 * Thumbnails come at 330 and 400 px; never scaled up. `EinkPixels.MEASURE_WIDTH` holds it too;
 * dry-check.json's twins name this one the owner, packages/picture-search/native/twins.json the value.
 */
export const MEASURE_WIDTH = 400;
const DIGITS = 2;

export type MeasuredPages = {
  results: SearchResult[];
  /** The measures the order used, by result id: of the converted thumbnail when converted. */
  measures: ReadonlyMap<string, Measures>;
  /**
   * Thumbnails shown prepared, result id to `file://` URI: as their contour drawing, or darkened
   * when faint (#81); `isContourUri` tells which.
   */
  contourThumbs: ReadonlyMap<string, string>;
};

export function unmeasured(results: SearchResult[]): MeasuredPages {
  return {results, measures: new Map(), contourThumbs: new Map()};
}

/** Whether the thumbnail at `uri` is a contour drawing: the picture is then inserted as one. */
export function isContourUri(uri: string): boolean {
  return uri.startsWith(FILE_PREFIX) && uri.endsWith(CONTOUR_SUFFIX);
}

/** A measured thumbnail, with the file it shows when prepared: its contour drawing or darkened. */
type PreparedThumb = Prepared & {thumb: string | null};

function asFound(measures: Measures): PreparedThumb {
  return {measures, look: 'found', thumb: null};
}

export type MeasureDeps = {
  analyzer: ImageAnalyzer;
  /** The thumbnail's URI: `file://<path>` once it is on the device. */
  thumb: (result: SearchResult, thumbDir: string) => Promise<string>;
  limitMs: number;
  /** The person's «All contour» style (#70): every measured thumbnail becomes a contour drawing. */
  allContour?: () => Promise<boolean>;
  /** The person's «Photos too» style (#70): the measured order ranks photos as drawings (#92). */
  photos?: () => Promise<boolean>;
  /** The result ids the person picked for the query, newest first (#34): they lead the order. */
  picked?: (query: string) => Promise<readonly string[]>;
};

/**
 * Measures the thumbnail at `uri` and prepares it in the look `chooseLook` gives; null when it is
 * not on the device or cannot be measured. A conversion is skipped once `late()` says the
 * result is no longer awaited: it would change nothing shown. A converted or darkened copy goes
 * to `pluginDir`'s thumbs/ folder, keyed by the result id (#103).
 */
async function measureFile(
  result: SearchResult,
  uri: string,
  pluginDir: string,
  deps: MeasureDeps,
  query: string,
  late: () => boolean = () => false,
  allContour = false,
): Promise<PreparedThumb | null> {
  if (!uri.startsWith(FILE_PREFIX)) {
    log(`pixels ${result.id}: not on the device, not measured`);
    return null;
  }
  const measured = await deps.analyzer.measure(uri.slice(FILE_PREFIX.length));
  if (!measured.ok) {
    log(`pixels ${result.id}: ${measured.message}`);
    return null;
  }
  const m = measured.value;
  log(
    `pixels ${result.id}: ${pixelKind(m)} lineArt ${lineArt(m).toFixed(
      DIGITS,
    )} in ${Math.round(m.ms)} ms`,
  );
  if (late()) {
    return asFound(m);
  }
  const look = chooseLook(m, query, allContour, undefined, result);
  if (look === 'darkened') {
    return darkenFile(result, uri, pluginDir, deps, m);
  }
  if (look === 'found') {
    return asFound(m);
  }
  const path = uri.slice(FILE_PREFIX.length);
  const dest = `${thumbPath(pluginDir, result)}${CONTOUR_SUFFIX}`;
  const converted = await deps.analyzer.toContour(path, dest, MEASURE_WIDTH);
  if (!converted.ok) {
    // Shown and inserted as it is: the grid never shows what is not inserted.
    log(`contour ${result.id}: ${converted.message}`);
    return asFound(m);
  }
  storeDerived(dest);
  const drawn = converted.value.measures;
  log(
    `contour ${result.id}: ${Math.round(
      converted.value.ms,
    )} ms, now ${pixelKind(drawn)}`,
  );
  if (chooseLook(m, query, allContour, drawn, result) === 'found') {
    // Mostly speckle: the picture is shown and inserted as it is (#83).
    log(`contour ${result.id}: speckled, shown as found`);
    return asFound(m);
  }
  return {measures: drawn, look: 'contour', thumb: `${FILE_PREFIX}${dest}`};
}

/**
 * Faint light-grey line work (#81): the tile shows it darkened, as the insert prepares it, and it
 * ranks by the measures of the darkened pixels, so a picture still faint ranks after the clear
 * ones.
 */
async function darkenFile(
  result: SearchResult,
  uri: string,
  pluginDir: string,
  deps: MeasureDeps,
  m: Measures,
): Promise<PreparedThumb> {
  if (!deps.analyzer.darken) {
    return asFound(m);
  }
  const path = uri.slice(FILE_PREFIX.length);
  const dest = `${thumbPath(pluginDir, result)}${DARKENED_SUFFIX}`;
  const darkened = await deps.analyzer.darken(path, dest, MEASURE_WIDTH);
  if (!darkened.ok) {
    log(`darken ${result.id}: ${darkened.message}`);
    return asFound(m);
  }
  storeDerived(dest);
  const drawn = darkened.value.measures;
  log(
    `darken ${result.id}: ${Math.round(darkened.value.ms)} ms, now ${pixelKind(
      drawn,
    )}`,
  );
  return {measures: drawn, look: 'darkened', thumb: `${FILE_PREFIX}${dest}`};
}

/**
 * The URI a later page's tile shows (#72): its contour drawing when it needs one, else the
 * stored file, else the web URL. The measure and conversion take at most `deps.limitMs` after
 * the download; then the picture shows as found. Never rejects.
 */
export async function measureThumb(
  result: SearchResult,
  thumbDir: string,
  query: string,
  deps: MeasureDeps,
): Promise<string> {
  let uri = result.thumbUrl;
  try {
    uri = await deps.thumb(result, thumbDir);
    const contourAll = (await deps.allContour?.()) ?? false;
    let ended = false;
    const found = await withinLimit(
      measureFile(result, uri, thumbDir, deps, query, () => ended, contourAll),
      deps.limitMs,
    );
    ended = true;
    if (found === undefined) {
      log(`pixels ${result.id}: limit reached, shown as found`);
    }
    return found?.thumb ?? uri;
  } catch (error) {
    log(`pixels ${result.id}: ${String(error)}`);
    return uri;
  }
}

/**
 * The results with pages 1 and 2 re-sorted by their pixels; unchanged without a thumbnail
 * folder. Never rejects: a failed download or measure leaves its result unmeasured.
 * `onThumbs` runs once every measured thumbnail is on the device (or failed), before the
 * limit: from then on a full download no longer holds a thumbnail back (#46, #88). It never
 * runs once the result is returned. With `untilLeader`, for «Insert best picture», the order
 * returns as soon as its first result is fixed whatever the others measure (#19): the rest of
 * the order is then that of the measures taken so far. With `fits` too, a mode's split (#111),
 * the first result that fits is the one waited for (`leaderDecided`).
 */
export async function measureFirstPages(
  results: SearchResult[],
  thumbDir: string | null,
  query: string,
  deps: MeasureDeps,
  onThumbs?: () => void,
  untilLeader = false,
  fits?: (measures: Measures) => boolean,
): Promise<MeasuredPages> {
  if (!thumbDir || results.length === 0) {
    return unmeasured(results);
  }
  const started = Date.now();
  const found = new Map<string, PreparedThumb>();
  const contourAll = (await deps.allContour?.()) ?? false;
  const photos = (await deps.photos?.()) ?? false;
  const firstPages = results.slice(0, MEASURED_RESULTS);
  const picked = (await deps.picked?.(query)) ?? [];
  // shortcut: a pick among the results leads anyway, so it waits for every thumbnail; decide on
  // the pick once its own thumbnail is measured if the log shows that wait (#19).
  const early =
    untilLeader && !results.some(result => picked.includes(pickId(result.id)));
  const pending = new Set(firstPages.map(result => result.id));
  let decide: () => void = () => {};
  const decided = new Promise<void>(resolve => {
    decide = resolve;
  });
  const uris = firstPages.map(result => deps.thumb(result, thumbDir));
  let returned = false;
  // No conversion starts once the order is returned: it would only delay the insert (#101).
  const late = () => returned;
  Promise.allSettled(uris).then(() => {
    if (!returned) {
      onThumbs?.();
    }
  });
  const leads = () =>
    leaderDecided(results, new Map(found), pending, query, photos, fits);
  const all = Promise.all(
    firstPages.map((result, index) =>
      uris[index]
        .then(uri =>
          measureFile(result, uri, thumbDir, deps, query, late, contourAll),
        )
        .then(measured => {
          if (measured) {
            found.set(result.id, measured);
          }
        })
        .catch(error => log(`pixels ${result.id}: ${String(error)}`))
        .then(() => {
          pending.delete(result.id);
          if (early && !returned && leads()) {
            decide();
          }
        }),
    ),
  );
  if (early && leads()) {
    decide();
  }
  const ended = await withinLimit(
    Promise.race([
      all.then(() => 'all' as const),
      decided.then(() => 'leader' as const),
    ]),
    deps.limitMs,
  );
  const limitReached = ended === undefined;
  const leaderFirst = ended === 'leader' && pending.size > 0;
  returned = true;
  // Copies: a measure that ends after the limit changes nothing already shown.
  const prepared = new Map<string, Prepared>();
  const used = new Map<string, Measures>();
  const contourThumbs = new Map<string, string>();
  for (const [id, {measures, look, thumb}] of found) {
    prepared.set(id, {measures, look});
    used.set(id, measures);
    if (thumb) {
      contourThumbs.set(id, thumb);
    }
  }
  log(
    `pixels: ${used.size} of ${Math.min(
      results.length,
      MEASURED_RESULTS,
    )} measured in ${Date.now() - started} ms${
      limitReached ? ', limit reached' : leaderFirst ? ', leader decided' : ''
    }`,
  );
  // The pixels never push a picture the person picked for the word down (#34).
  const distinct = picksFirst(
    orderMeasured(results, prepared, query, photos),
    picked,
  );
  if (distinct.length < results.length) {
    log(`pixels: ${results.length - distinct.length} near-duplicates left out`);
  }
  return {
    results: distinct,
    measures: used,
    contourThumbs,
  };
}
