/**
 * Pixel measures of a thumbnail and what they say about it (#66; research note
 * 2026-11-search-ranking sections 3, 4 and 7, and research D on iconic pictures). The measuring
 * itself sits behind `ImageAnalyzer`, which the device implements in `src/storage/measures.ts`
 * and another project can supply; `pixelScorer` is one more `Scorer` of the ranker.
 */
import {dropNearDuplicates} from './duplicates';
import {readIntent} from './query';
import {
  DEFAULT_SCORERS,
  intentFor,
  PHOTO_SCORERS,
  Scorer,
  showsFlag,
  total,
} from './rank';
import {Outcome, PAGE_SIZE, SearchResult} from './types';

/** What an analyzer call gives: the value, or why there is none, for the log. */
export type Measured<T> = Outcome<T, {ok: false; message: string}>;

/**
 * The features `ThumbMeasures.java` computes on gray values flattened on white. Shares are 0 to 1,
 * grays 0 to 255, the ink box in pixels; `ms` is the decode and measure time.
 */
export type Measures = {
  width: number;
  height: number;
  mean: number;
  dark: number;
  white: number;
  mid: number;
  /** White share of the outer 5 % frame. */
  border: number;
  /** Median gray of that frame: the background. */
  borderMedian: number;
  /** Share of pixels darker than the background by 48 grays. */
  ink: number;
  inkLeft: number;
  inkTop: number;
  inkWidth: number;
  inkHeight: number;
  /** Lines of ink in the ink box (horizontal projection). */
  bands: number;
  /** Ink box width over one band's height: high for writing. */
  lineAspect: number;
  /** Ink pixels per boundary ink pixel: a stroke-width estimate. */
  thickness: number;
  /** Share of Sobel edge pixels. */
  edge: number;
  /** Area share of the box holding 98 % of the edge energy per axis (Ke 2006). */
  edgeBox: number;
  /** Distinct 12-bit colours. */
  colours: number;
  /** Share of pixels that differ from the background. */
  objectShare: number;
  /** Perceptual hash, 48 hex digits (`PerceptualHash.java`, #89); absent from an older module. */
  hash?: string;
  /** Share of the ink in short parts, under 10 % of the longer side: texture and speckle (#83). */
  fragments: number;
  /** The darkest ink's gray, 255 without ink: light grey for faint line work (#81). */
  darkest: number;
  /** Thin light-grey lines on paper, by `EinkPixels.isFaintLines`: the insert darkens them (#81). */
  faintLines: boolean;
  ms: number;
};

/**
 * A picture file written by `toContour` or `darken`: its size, the time it took, and the measures
 * of the pixels it wrote, as `measure` would read them back from the file (#101).
 */
export type ConvertedImage = {
  width: number;
  height: number;
  ms: number;
  measures: Measures;
};

/** Measures and converts picture files; the device's is the plugin's Java module. */
export type ImageAnalyzer = {
  measure: (path: string) => Promise<Measured<Measures>>;
  /** Writes `dest` as a contour drawing of `src`, scaled down to `width` (never up). */
  toContour: (
    src: string,
    dest: string,
    width: number,
  ) => Promise<Measured<ConvertedImage>>;
  /**
   * Writes `dest` as the picture prepared for e-ink without a contour, faint lines darkened
   * (#81), as the insert prepares it; without it, a faint picture shows as found.
   */
  darken?: (
    src: string,
    dest: string,
    width: number,
  ) => Promise<Measured<ConvertedImage>>;
};

/**
 * What a thumbnail looks like, for the log and for the contour conversion. Thresholds are the
 * research's starting values, fitted on 28 thumbnails [INFERENCE beyond them].
 */
export type PixelKind =
  | 'blank'
  | 'dark'
  | 'solid'
  | 'photo'
  | 'text'
  | 'faint'
  | 'outline'
  | 'clean'
  | 'plain';

/** Below this object share the thumbnail shows nothing: white on transparent, or empty. */
const BLANK_OBJECT = 0.005;
const DARK_MEAN = 100;
/** Under this border white share the picture fills its frame: a photo or a painting. */
const FILLED_BORDER = 0.3;
const PHOTO_MID = 0.4;
/**
 * From this border white share the subject stands on clean paper. `EinkPixels.CLEAN_BORDER` holds
 * it too; dry-check.json's twins name this one the owner, native/twins.json the value.
 */
export const CLEAN_BORDER = 0.85;
const TEXT_INK = 0.25;
const TEXT_LINE_ASPECT = 2.5;
const FAINT_INK = 0.01;
const FAINT_WHITE = 0.9;
const OUTLINE_WHITE = 0.6;
const OUTLINE_DARK = 0.2;
/**
 * From this share of dark pixels a picture on paper reads as a black block on e-ink: a
 * silhouette, a dark shaded or gradient clip art (#81). Measured in the search lab on 652
 * thumbnails of its cases (2026-11-07): from 0.3 every picture is a heavy black area and its
 * contour drawing a clean outline; below it sits thick line art (clocks, bicycles), whose contour
 * only doubles its lines.
 */
const DARK_CLIPART = 0.3;
/** A solid fill: much ink in thick areas, hard to annotate (research D); a silhouette below 0.3. */
const SOLID_INK = 0.25;
const SOLID_STROKE = 15;

function isFaint(m: Measures): boolean {
  return m.ink < FAINT_INK && m.white > FAINT_WHITE;
}

function isSolid(m: Measures): boolean {
  return m.ink > SOLID_INK && m.thickness > SOLID_STROKE;
}

export function pixelKind(m: Measures): PixelKind {
  if (m.objectShare < BLANK_OBJECT) {
    return 'blank';
  }
  if (m.mean < DARK_MEAN && m.border < FILLED_BORDER) {
    return 'dark';
  }
  if (m.border < FILLED_BORDER && m.mid >= PHOTO_MID) {
    return 'photo';
  }
  if (m.dark >= DARK_CLIPART || isSolid(m)) {
    return 'solid';
  }
  const clean = m.border >= CLEAN_BORDER;
  if (clean && m.ink < TEXT_INK && m.lineAspect >= TEXT_LINE_ASPECT) {
    return 'text';
  }
  if (isFaint(m)) {
    return 'faint';
  }
  if (clean && m.white >= OUTLINE_WHITE && m.dark <= OUTLINE_DARK) {
    return 'outline';
  }
  return clean ? 'clean' : 'plain';
}

const CONVERTED: ReadonlySet<PixelKind> = new Set(['solid']);
const ALREADY_LINES: ReadonlySet<PixelKind> = new Set([
  'outline',
  'text',
  'faint',
  'blank',
]);
/** A photo or a dark painting: never a contour drawing (owner, #104, D34 B). */
const PHOTO_LIKE: ReadonlySet<PixelKind> = new Set(['dark', 'photo']);

/**
 * Whether the thumbnail reads as a photo or a dark painting. It is shown and inserted as found,
 * in grey with the e-ink curve, never as a contour drawing, whatever the query or the style
 * (owner, 2026-11-14, #104, replacing D5 A for photos and paintings).
 */
export function isPhotoLike(m: Measures): boolean {
  return isPhotoKind(pixelKind(m));
}

/** Whether a pixel kind is a photo's or a dark painting's (#104). */
export function isPhotoKind(kind: PixelKind): boolean {
  return PHOTO_LIKE.has(kind);
}

/**
 * Whether the picture is shown and inserted as a contour drawing: dark clip art on paper (#81),
 * or any picture not already line work when the query asks for an outline; never a photo or a
 * dark painting (#104), never when the query asks for a photo or a painting, and never for a few
 * flat areas.
 */
export function needsContour(m: Measures, query: string): boolean {
  // The query's style words are read once, by the query pipeline (#65).
  const {styles} = readIntent(query);
  if (
    styles.has('photo') ||
    styles.has('painting') ||
    isFlat(m) ||
    isPhotoLike(m)
  ) {
    return false;
  }
  const kind = pixelKind(m);
  return (
    CONVERTED.has(kind) || (styles.has('drawing') && !ALREADY_LINES.has(kind))
  );
}

/**
 * A picture of a few large flat areas of grey: a flag, clip art with solid colour fills. The
 * contour turns each flat area white and keeps only its borders, the «white box with two lines»
 * the flag of Spain became on build 15, so it keeps its grey (#89). In the search lab's 560
 * thumbnails the contour would convert, every one with at most 64 colours, under 10 % edges and
 * 20 % mid greys or more was a flag, a sign or colour clip art whose contour lost it; the one-tone
 * silhouettes, under 5 % mid greys, keep their clean outline (#81).
 */
const FLAT_COLOURS = 64;
const FLAT_EDGE = 0.1;
const FLAT_MID = 0.2;

export function isFlat(m: Measures): boolean {
  return m.colours <= FLAT_COLOURS && m.edge < FLAT_EDGE && m.mid >= FLAT_MID;
}

/**
 * A contour drawing that is mostly speckle: much of its ink in short fragments (texture, foliage,
 * water, fine hatching) or ink over much of it (a crowd). Its picture then shows as it is (#83).
 * Set in the search lab on 72 converted thumbnails with the cleaned contour (2026-11-07): every
 * drawing the owner would call speckled was over one of the two, the portraits and silhouettes
 * under both, except a light bust photo at 0.47 fragments.
 */
const SPECKLED_FRAGMENTS = 0.35;
const SPECKLED_INK = 0.4;

export function isSpeckled(contour: Measures): boolean {
  return contour.fragments >= SPECKLED_FRAGMENTS || contour.ink >= SPECKLED_INK;
}

/**
 * A photo so busy that its contour drawing is speckle whatever its measures say: a city seen from
 * the air, a crowd of leaves, a wall of stones. Its many short strokes join into parts too long
 * for `fragments`, so `isSpeckled` misses them (#24: «Cidade Maravilhosa» at 0.18). In the search
 * lab's 411 converted thumbnails of pages 1 and 2 (run after-20), each of the 19 photos with 40 %
 * edge pixels or more became a drawing of dots and dashes; the clean ones were under it, the
 * nearest a Napoleon engraving at 38 %. It is shown as found, and no drawing is made.
 */
const BUSY_EDGE = 0.4;

export function isBusy(found: Measures): boolean {
  return found.edge >= BUSY_EDGE;
}

/**
 * Whether the picture is faint line work on paper, which the insert darkens (#81). The rule is the
 * native one, `EinkPixels.isFaintLines`, which darkens it: one owner.
 */
export function isFaintLines(m: Measures): boolean {
  return m.faintLines;
}

/** The weights of the line-art score (research D, section 3). */
const LINE_ART = {
  lowMid: 0.3,
  white: 0.2,
  fewColours: 0.15,
  tightEdges: 0.15,
  outline: 0.2,
  solid: -0.2,
  faint: -0.2,
};
/** log2 of the colour count: 8 colours or fewer score 0, 1024 or more score 1. */
const FEW_COLOURS_LOG2 = 3;
const MANY_COLOURS_LOG2 = 10;
/** A thin-stroke outline: this much ink, in strokes this thick (ink per boundary pixel). */
const OUTLINE_INK_MIN = 0.01;
const OUTLINE_INK_MAX = 0.3;
const THIN_STROKE = 4;
const MEDIUM_STROKE = 8;
const HALF = 0.5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function outlineTerm(m: Measures): number {
  if (m.ink < OUTLINE_INK_MIN || m.ink > OUTLINE_INK_MAX) {
    return 0;
  }
  return m.thickness <= THIN_STROKE
    ? 1
    : m.thickness <= MEDIUM_STROKE
    ? HALF
    : 0;
}

/**
 * How much the thumbnail looks like clean line art that prints well on e-ink: few mid grays,
 * white paper, few colours, edges in a tight box, thin strokes; minus solid fills and faint lines.
 */
export function lineArt(m: Measures): number {
  const colours = clamp01(
    (Math.log2(Math.max(1, m.colours)) - FEW_COLOURS_LOG2) /
      (MANY_COLOURS_LOG2 - FEW_COLOURS_LOG2),
  );
  const solid = isSolid(m) ? 1 : 0;
  return (
    LINE_ART.lowMid * (1 - m.mid) +
    LINE_ART.white * m.white +
    LINE_ART.fewColours * (1 - colours) +
    LINE_ART.tightEdges * (1 - m.edgeBox) +
    LINE_ART.outline * outlineTerm(m) +
    LINE_ART.solid * solid +
    LINE_ART.faint * (isFaint(m) ? 1 : 0)
  );
}

/** Pages 1 and 2: their thumbnails are on the device before page 1 shows (research section 7). */
export const MEASURED_RESULTS = 2 * PAGE_SIZE;
/** `einkScore + 3 x lineArt`, lineArt scaled 0 to 1 within the measured thumbnails (research D). */
const LINE_ART_WEIGHT = 3;
/**
 * shortcut: a thumbnail that could not be measured scores the middle of the scale, so a failed
 * measure neither lifts nor buries it; upgrade when the search lab shows a better default.
 */
const UNMEASURED = 0.5;
/**
 * Below every picture shown as found: a photo or painting shown as its contour drawing. A real
 * line drawing or vector picture comes first (#83, owner: «não tem imagem tipo mais limpa?»).
 */
const CONVERTED_SCALE = -1;
/**
 * Below the contour drawings: a picture of mostly large text, a quote poster (#83), and faint
 * line work not darkened or still faint once darkened, its lines too thin for e-ink (#81).
 */
const LAST_SCALE = -2;

/**
 * The scale a measured picture takes whatever the others measure: last for faint line work, text
 * and faint pictures, then a contour drawing; undefined for one scored by its line art.
 */
function fixedScale(m: Measures, converted: boolean): number | undefined {
  const kind = pixelKind(m);
  if (isFaintLines(m) || kind === 'faint' || kind === 'text') {
    return LAST_SCALE;
  }
  return converted ? CONVERTED_SCALE : undefined;
}

/**
 * The pixel signal over one set of measures: `3 x lineArt`, min-max scaled within the set, so it
 * moves pictures only relative to each other. A canonical picture, or a symbol that leads, scores
 * 0: it keeps its place.
 * `converted` names the pictures shown as their contour drawing.
 */
export function pixelScorer(
  measures: ReadonlyMap<string, Measures>,
  converted: ReadonlySet<string> = new Set(),
): Scorer {
  const scores = new Map<string, number>();
  const fixed = new Map<string, number>();
  for (const [id, m] of measures) {
    const set = fixedScale(m, converted.has(id));
    if (set !== undefined) {
      fixed.set(id, set);
    } else if (pixelKind(m) !== 'blank') {
      scores.set(id, lineArt(m));
    }
  }
  const values = [...scores.values()];
  const low = Math.min(...values);
  const range = Math.max(...values) - low;
  return result => {
    // A symbol its source leads with stays above every drawing, measures included (rank.ts,
    // SYMBOL_LEAD_SCORE): the «hot beverage» cup's steam lines measure as text (#106).
    if (result.canonical || result.leads) {
      return 0;
    }
    const set = fixed.get(result.id);
    if (set !== undefined) {
      return LINE_ART_WEIGHT * set;
    }
    const score = scores.get(result.id);
    const scaled =
      score === undefined
        ? UNMEASURED
        : range > 0
        ? (score - low) / range
        : HALF;
    return LINE_ART_WEIGHT * scaled;
  };
}

/**
 * Whether the picture leaves pages 1 and 2: a blank thumbnail that is not canonical. A near-black
 * photo or painting stays, shown as found in dark grey (owner D38 B, #104): since #104 it is never
 * a speckled contour, which is why #83 sent it away.
 */
function isLeft(
  result: SearchResult,
  measures: ReadonlyMap<string, Measures>,
): boolean {
  const m = measures.get(result.id);
  return m !== undefined && pixelKind(m) === 'blank' && !result.canonical;
}

/**
 * Re-sorts the first MEASURED_RESULTS results by `einkScore + pixelScorer`; ties keep their
 * order. A canonical Wikidata picture keeps its index (brief section 5.5, rule 4). A blank
 * thumbnail goes to the end of the list; the next result fills its place. Later
 * results keep their order. `converted` names the pictures shown as their contour drawing.
 * `photos` is the person's «Photos too» style (#70): the same scorers as the search then (#92).
 */
export function reorderByMeasures(
  results: readonly SearchResult[],
  measures: ReadonlyMap<string, Measures>,
  query = '',
  converted: ReadonlySet<string> = new Set(),
  photos = false,
): SearchResult[] {
  if (measures.size === 0) {
    return [...results];
  }
  const head = results.slice(0, MEASURED_RESULTS);
  const pixels = pixelScorer(measures, converted);
  const intent = intentFor(query, results);
  const blank = head.filter(result => isLeft(result, measures));
  const sorted = head
    .filter(result => !result.canonical && !isLeft(result, measures))
    .map((result, order) => ({
      result,
      order,
      score: total(result, intent, [
        ...(photos ? PHOTO_SCORERS : DEFAULT_SCORERS),
        pixels,
      ]),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.result);
  const queue = [...sorted, ...results.slice(MEASURED_RESULTS)];
  const ordered: SearchResult[] = [];
  for (const result of head) {
    // Each other slot takes the next sorted result, or a later one when blanks left.
    const keeps = result.canonical && !isLeft(result, measures);
    const next = keeps ? result : queue.shift();
    if (next) {
      ordered.push(next);
    }
  }
  return [...ordered, ...queue, ...blank];
}

/**
 * How a measured thumbnail is shown, and so inserted (#66, #104): as its contour drawing,
 * darkened (#81), or as found.
 */
export type Look = 'contour' | 'darkened' | 'found';

/** A measured thumbnail: the measures its order uses (of what it shows) and its look. */
export type Prepared = {measures: Measures; look: Look};

/**
 * The look of a thumbnail measured as `found` (#66, #81, #83): its contour drawing when
 * `needsContour` names it or the person chose «All contour» (#70), unless the photo is too busy
 * for one (#24) or that drawing is mostly speckle; else darkened when it is faint line work; else as found. Without `contour`, the
 * drawing is not made yet, and 'contour' says to make it; call again with its measures. A flag
 * (`result`) keeps its grey unless the person chose «All contour» (#20). A photo or a dark
 * painting is never a contour, «All contour» included (#104).
 */
export function chooseLook(
  found: Measures,
  query: string,
  allContour = false,
  contour?: Measures,
  result?: SearchResult,
): Look {
  const flag = result !== undefined && showsFlag(result);
  const converts = allContour
    ? !isPhotoLike(found)
    : needsContour(found, query) && !flag;
  if (converts) {
    return isBusy(found) || (contour && isSpeckled(contour))
      ? 'found'
      : 'contour';
  }
  return isFaintLines(found) ? 'darkened' : 'found';
}

/**
 * Pages 1 and 2 in the order the device shows them (#66, #89): `reorderByMeasures` over what each
 * measured thumbnail shows, the contour drawings after the pictures shown as found (#83), then
 * each near-duplicate once. `photos` is the person's «Photos too» style (#92).
 */
export function orderMeasured(
  results: readonly SearchResult[],
  prepared: ReadonlyMap<string, Prepared>,
  query: string,
  photos = false,
): SearchResult[] {
  const measures = new Map<string, Measures>();
  const converted = new Set<string>();
  for (const [id, {measures: m, look}] of prepared) {
    measures.set(id, m);
    if (look === 'contour') {
      converted.add(id);
    }
  }
  const ordered = reorderByMeasures(
    results,
    measures,
    query,
    converted,
    photos,
  );
  return dropNearDuplicates(ordered, measures);
}

/**
 * What one result can still score while thumbnails are measured: its bounds, and its line art
 * when that is the one pixel term left open, a measured line drawing (#19).
 */
type Candidate = {
  result: SearchResult;
  order: number;
  base: number;
  low: number;
  high: number;
  pending: boolean;
  lineArt?: number;
};

/**
 * Whether the first result of `orderMeasured` is already fixed while the thumbnails of `pending`
 * are still measured (#19): true when it is the same whatever they measure, or when they fail or
 * time out, and its own thumbnail is measured. A canonical first result keeps its place.
 * Otherwise the pixel term lies between `LINE_ART_WEIGHT x LAST_SCALE` and `LINE_ART_WEIGHT`, and
 * a line drawing's between 0 and `LINE_ART_WEIGHT`, min-max scaled within the set; between two
 * measured line drawings, the scale keeps their order and its range only grows. One difference
 * is left: a pending near-duplicate of the winner with a cleaner edge would take its place in
 * `dropNearDuplicates`, the same picture.
 */
export function leaderDecided(
  results: readonly SearchResult[],
  prepared: ReadonlyMap<string, Prepared>,
  pending: ReadonlySet<string>,
  query: string,
  photos = false,
): boolean {
  const head = results.slice(0, MEASURED_RESULTS);
  if (head.length === 0) {
    return true;
  }
  if (head[0].canonical) {
    // Its own measure still sets its look, and so what is inserted.
    return !pending.has(head[0].id);
  }
  const intent = intentFor(query, results);
  const scorers = photos ? PHOTO_SCORERS : DEFAULT_SCORERS;
  const candidates: Candidate[] = [];
  head
    .filter(result => !result.canonical)
    .forEach((result, order) => {
      const base = total(result, intent, scorers);
      const at = (scale: number) => ({
        result,
        order,
        base,
        low: base + LINE_ART_WEIGHT * scale,
        high: base + LINE_ART_WEIGHT * scale,
        pending: false,
      });
      const found = prepared.get(result.id);
      if (pending.has(result.id)) {
        candidates.push({
          ...at(LAST_SCALE),
          high: base + LINE_ART_WEIGHT,
          pending: true,
        });
      } else if (!found) {
        candidates.push(at(UNMEASURED));
      } else if (pixelKind(found.measures) !== 'blank') {
        // A blank one leaves pages 1 and 2 (`isLeft`).
        const set = result.leads
          ? 0
          : fixedScale(found.measures, found.look === 'contour');
        candidates.push(
          set !== undefined
            ? at(set)
            : {
                ...at(0),
                high: base + LINE_ART_WEIGHT,
                lineArt: lineArt(found.measures),
              },
        );
      }
    });
  const arts = candidates.flatMap(c =>
    c.lineArt === undefined ? [] : [c.lineArt],
  );
  const range = Math.max(...arts) - Math.min(...arts);
  /** Whether `a` ranks before `b` whatever the pending thumbnails measure. */
  const before = (a: Candidate, b: Candidate): boolean => {
    if (a.lineArt !== undefined && b.lineArt !== undefined) {
      const gap = a.lineArt - b.lineArt;
      // Scaled by a range at least `range`: the gap's share is at most gap / range.
      const least =
        a.base -
        b.base +
        (gap >= 0
          ? 0
          : range > 0
          ? (LINE_ART_WEIGHT * gap) / range
          : -LINE_ART_WEIGHT);
      return least > 0 || (least === 0 && gap >= 0 && a.order < b.order);
    }
    return a.low > b.high || (a.low === b.high && a.order < b.order);
  };
  return candidates.some(
    leader =>
      !leader.pending &&
      candidates.every(other => other === leader || before(leader, other)),
  );
}

/** A lasso button's kind of picture (#111): «Insert illustration» or «Insert photo». */
export type PictureMode = 'illustration' | 'photo';

/**
 * Whether a measured tile belongs to a mode's list (#111): a photo or a dark painting for
 * `photo`, any other shown tile for `illustration`. A blank tile belongs to neither.
 */
export function fitsMode(kind: PixelKind, mode: PictureMode): boolean {
  if (kind === 'blank') {
    return false;
  }
  return isPhotoKind(kind) === (mode === 'photo');
}

/**
 * A mode's pages 1 and 2 (#111): the measured order with only the measured tiles that fit the
 * mode, in that order, so the illustration and photo lists are a real split, never one blended
 * list. A tile of the other kind, a blank one and an unmeasured one are left out, even when fewer
 * than MEASURED_RESULTS fit: a photo list with no photo is empty, never drawings.
 * shortcut: only the measured tiles (pages 1 and 2); measure further pages once Lookup's Choose
 * button shows more than two pages (D19 A).
 */
export function keepMode(
  ordered: readonly SearchResult[],
  measures: ReadonlyMap<string, Measures>,
  mode: PictureMode,
): SearchResult[] {
  return ordered.filter(result => {
    const m = measures.get(result.id);
    return m !== undefined && fitsMode(pixelKind(m), mode);
  });
}
