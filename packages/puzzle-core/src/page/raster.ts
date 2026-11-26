/**
 * A page of greys and the few ways to paint it (#379). One byte per pixel, row after row, white at
 * the start. Every paint call leaves only the 16 native greys: a partly covered pixel blends toward
 * the tone and snaps to the nearest level.
 *
 * The same page must come out on the Mac (Node) and on the tablet (Hermes), so this uses only
 * `+ - * /`, `Math.floor`, `Math.round` and `Math.sqrt`, which IEEE 754 fixes exactly; no
 * trigonometry, whose last digit engines may differ in.
 */
import { GREY_STEP, TONES, type Tone } from './look';

export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  /**
   * One flag per row: 0 while the row is known to equal the row above, as every row of a blank
   * page does. The paint calls here keep it; the PNG encoder then skips those rows instead of
   * comparing them, which was most of its time on the tablet (#379, device round 11). A raster
   * without it, or one whose pixels were written directly, is compared row by row.
   */
  readonly changedRows?: Uint8Array;
}

/** Sub-rows sampled per pixel row, at their middles; across a row the coverage is exact. */
const SUB_ROWS = 4;
const MIDDLE = 0.5;
/** An edge's four numbers in the flat edge list. */
const EDGE = { x0: 0, y0: 1, x1: 2, y1: 3, size: 4 } as const;

export function createRaster(width: number, height: number): Raster {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`a page needs a whole positive size, not ${width} x ${height}`);
  }
  return { width, height, pixels: new Uint8Array(width * height).fill(TONES.paper), changedRows: new Uint8Array(height) };
}

/** Marks that row `row` may now differ from the row above, and the row below from it. */
function markChanged(raster: Raster, row: number): void {
  const rows = raster.changedRows;
  if (!rows) return;
  if (row < rows.length) rows[row] = 1;
  if (row + 1 < rows.length) rows[row + 1] = 1;
}

/** Throws on the first pixel that is not one of the 16 native greys. */
export function assertNativeGreys(raster: Raster): void {
  const { pixels, width } = raster;
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] % GREY_STEP !== 0) {
      const x = i % width;
      const y = (i - x) / width;
      throw new Error(`pixel (${x}, ${y}) is 0x${pixels[i].toString(16)}, not one of the 16 native greys`);
    }
  }
}

function snap(value: number): number {
  return Math.round(value / GREY_STEP) * GREY_STEP;
}

/** A rectangle on whole pixels, clipped to the page. */
export function fillRect(raster: Raster, x: number, y: number, width: number, height: number, tone: Tone): void {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`a rectangle sits on whole pixels, not at ${x}, ${y}, ${width} x ${height}`);
  }
  const grey = TONES[tone];
  const left = Math.max(0, x);
  const right = Math.min(raster.width, x + width);
  const top = Math.max(0, y);
  const bottom = Math.min(raster.height, y + height);
  if (right <= left || bottom <= top) return;
  for (let row = top; row < bottom; row++) {
    raster.pixels.fill(grey, row * raster.width + left, row * raster.width + right);
  }
  // The rows inside get the same span, so each still equals the row above if it did; only the
  // first row and the row after the last may now differ from their neighbour above.
  markChanged(raster, top);
  markChanged(raster, bottom - 1);
}

/** Gives the covered spans [from, to) of one sub-row at height `y`, in any order. */
type SpanSource = (y: number, add: (from: number, to: number) => void) => void;

/**
 * One row's coverage, kept between calls and left all zero after each: a page draws hundreds of
 * polygons (each line of a hex lattice is one), and a new array for each was a large part of the
 * drawing time on the tablet (#379, device round 11).
 */
let rowCoverage = new Float64Array(0);

/**
 * Receives one row's coverage over columns [from, to] and must leave those entries zero: the
 * buffer is shared by every call.
 */
type RowSink = (row: number, coverage: Float64Array, from: number, to: number) => void;

/**
 * Sums the coverage of the spans each sub-row of rows [top, bottom) gives, clipped to a canvas of
 * `width` x `height`, and hands each covered row to `sink`.
 */
function coverSpans(width: number, height: number, top: number, bottom: number, spans: SpanSource, sink: RowSink): void {
  const firstRow = Math.max(0, Math.floor(top));
  const lastRow = Math.min(height, Math.ceil(bottom));
  if (rowCoverage.length < width + 1) rowCoverage = new Float64Array(width + 1);
  const coverage = rowCoverage;
  let minX = width;
  let maxX = -1;
  const add = (from: number, to: number) => {
    const a = Math.max(0, from);
    const b = Math.min(width, to);
    if (b <= a) return;
    const first = Math.floor(a);
    const last = Math.floor(b);
    if (first < minX) minX = first;
    if (last > maxX) maxX = last;
    if (first === last) {
      coverage[first] += (b - a) / SUB_ROWS;
      return;
    }
    coverage[first] += (first + 1 - a) / SUB_ROWS;
    for (let x = first + 1; x < last; x++) coverage[x] += 1 / SUB_ROWS;
    coverage[last] += (b - last) / SUB_ROWS;
  };
  for (let row = firstRow; row < lastRow; row++) {
    for (let k = 0; k < SUB_ROWS; k++) spans(row + (k + MIDDLE) / SUB_ROWS, add);
    if (maxX < 0) continue;
    sink(row, coverage, minX, Math.min(maxX, width - 1));
    coverage[width] = 0;
    minX = width;
    maxX = -1;
  }
}

/** Blends a tone over a row's coverage: a covered pixel moves toward the tone and snaps to a native grey. */
function blendRow(raster: Raster, row: number, x0: number, coverage: Float64Array, from: number, to: number, grey: number): void {
  const pixels = raster.pixels;
  const base = row * raster.width + x0;
  // Written inline, as this loop runs for every covered pixel of every polygon and glyph.
  for (let x = from; x <= to; x++) {
    const c = coverage[x];
    if (c > 0) {
      const current = pixels[base + x];
      pixels[base + x] = c >= 1 ? grey : snap(current + (grey - current) * c);
    }
  }
  markChanged(raster, row);
}

/** Paints `tone` over the spans each sub-row of rows [top, bottom) gives, blending partial pixels. */
function paintSpans(raster: Raster, top: number, bottom: number, tone: Tone, spans: SpanSource): void {
  const grey = TONES[tone];
  coverSpans(raster.width, raster.height, top, bottom, spans, (row, coverage, from, to) => {
    blendRow(raster, row, 0, coverage, from, to, grey);
    coverage.fill(0, from, to + 1);
  });
}

/** A shape's coverage on a small canvas of its own, to paint at any whole-pixel place (#379). */
export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly coverage: Float64Array;
}

/** The mask of polygons given in the mask's own pixels, by the non-zero rule, as `fillPolygon` fills them. */
export function polygonMask(contours: readonly (readonly number[])[], width: number, height: number): Mask {
  const coverage = new Float64Array(width * height);
  const shape = polygonSpans(contours, height);
  if (shape) {
    coverSpans(width, height, shape.top, shape.bottom, shape.spans, (row, rowCover, from, to) => {
      coverage.set(rowCover.subarray(from, to + 1), row * width + from);
      rowCover.fill(0, from, to + 1);
    });
  }
  return { width, height, coverage };
}

/** A mask and where its top-left corner sits from the point its shape was drawn around. */
export interface PlacedMask {
  readonly mask: Mask;
  readonly left: number;
  readonly top: number;
}

/** The mask of polygons given around a point of their own, with the whole-pixel offset of its corner. */
export function placedMask(contours: readonly (readonly number[])[]): PlacedMask {
  const xs = contours.flatMap((contour) => contour.filter((_, i) => i % 2 === 0));
  const ys = contours.flatMap((contour) => contour.filter((_, i) => i % 2 === 1));
  const left = Math.floor(Math.min(...xs));
  const top = Math.floor(Math.min(...ys));
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  const local = contours.map((contour) => contour.map((v, i) => (i % 2 === 0 ? v - left : v - top)));
  return { mask: polygonMask(local, Math.ceil(right) - left + 1, Math.ceil(bottom) - top + 1), left, top };
}

/** Masks by key, started again past a few hundred; a page uses a few dozen of each kind. */
export class MaskCache {
  private readonly masks = new Map<string, PlacedMask>();
  constructor(private readonly limit: number) {}
  get(key: string, make: () => PlacedMask): PlacedMask {
    const found = this.masks.get(key);
    if (found) return found;
    const made = make();
    if (this.masks.size >= this.limit) this.masks.clear();
    this.masks.set(key, made);
    return made;
  }
}

/** The steps per pixel a cached shape's start snaps to, so equal shapes share one mask. */
export const MASK_SUBPIXEL = 8;
/** How many masks of one kind a cache keeps before it starts again. */
export const MASK_CACHE_LIMIT = 384;

/** Paints a mask with its top-left corner at the whole pixel (x, y), clipped to the page. */
export function paintMask(raster: Raster, mask: Mask, x: number, y: number, tone: Tone): void {
  const grey = TONES[tone];
  const from = Math.max(0, -x);
  const to = Math.min(mask.width, raster.width - x) - 1;
  if (to < from) return;
  for (let row = Math.max(0, -y); row < mask.height && y + row < raster.height; row++) {
    blendRow(raster, y + row, x, mask.coverage.subarray(row * mask.width, (row + 1) * mask.width), from, to, grey);
  }
}

/**
 * Fills polygons by the non-zero rule. Each contour is a flat list x0, y0, x1, y1, ... in page
 * pixels, closed back to its first point; contours of one call make one shape (a glyph's holes).
 */
export function fillPolygon(raster: Raster, contours: readonly (readonly number[])[], tone: Tone): void {
  const shape = polygonSpans(contours, raster.height);
  if (shape) paintSpans(raster, shape.top, shape.bottom, tone, shape.spans);
}

/** The rows polygons cover and their spans per sub-row, by the non-zero rule; null for no area. */
function polygonSpans(
  contours: readonly (readonly number[])[],
  height: number,
): { top: number; bottom: number; spans: SpanSource } | null {
  const edges: number[] = [];
  let top = Infinity;
  let bottom = -Infinity;
  for (const c of contours) {
    const n = c.length / 2;
    for (let i = 0; i < n; i++) {
      const x0 = c[2 * i];
      const y0 = c[2 * i + 1];
      const j = (i + 1) % n;
      const x1 = c[2 * j];
      const y1 = c[2 * j + 1];
      if (y0 === y1) continue;
      edges.push(x0, y0, x1, y1);
      top = Math.min(top, y0, y1);
      bottom = Math.max(bottom, y0, y1);
    }
  }
  if (edges.length === 0) return null;
  // Each pixel row lists the edges that reach it, so a sub-row tests only those, not every edge
  // of a glyph: text is most of a page's drawing time on the tablet.
  const firstRow = Math.max(0, Math.floor(top));
  const byRow: number[][] = [];
  for (let e = 0; e < edges.length; e += EDGE.size) {
    const from = Math.max(firstRow, Math.floor(Math.min(edges[e + EDGE.y0], edges[e + EDGE.y1])));
    const to = Math.min(height - 1, Math.floor(Math.max(edges[e + EDGE.y0], edges[e + EDGE.y1])));
    for (let row = from; row <= to; row++) (byRow[row - firstRow] ??= []).push(e);
  }
  const xs: number[] = [];
  const dirs: number[] = [];
  const spans: SpanSource = (y, add) => {
    const candidates = byRow[Math.floor(y) - firstRow];
    if (!candidates) return;
    xs.length = 0;
    dirs.length = 0;
    for (const e of candidates) {
      const x0 = edges[e + EDGE.x0];
      const y0 = edges[e + EDGE.y0];
      const x1 = edges[e + EDGE.x1];
      const y1 = edges[e + EDGE.y1];
      const down = y1 > y0;
      if (down ? y < y0 || y >= y1 : y < y1 || y >= y0) continue;
      const x = x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
      // Insertion sort: a sub-row crosses only a few edges.
      let i = xs.length;
      xs.push(x);
      dirs.push(down ? 1 : -1);
      while (i > 0 && xs[i - 1] > x) {
        xs[i] = xs[i - 1];
        dirs[i] = dirs[i - 1];
        i--;
      }
      xs[i] = x;
      dirs[i] = down ? 1 : -1;
    }
    let winding = 0;
    for (let i = 0; i < xs.length; i++) {
      if (winding !== 0) add(xs[i - 1], xs[i]);
      winding += dirs[i];
    }
  };
  return { top, bottom, spans };
}

/** A filled circle of radius `r` around (cx, cy). */
export function fillDisc(raster: Raster, cx: number, cy: number, r: number, tone: Tone): void {
  paintSpans(raster, cy - r, cy + r, tone, (y, add) => {
    const dy = y - cy;
    const squared = r * r - dy * dy;
    if (squared <= 0) return;
    const half = Math.sqrt(squared);
    add(cx - half, cx + half);
  });
}

/**
 * The masks of lines by their run, rise, width and start within its pixel. A lattice repeats each
 * edge shape many times at whole-pixel steps, so each is filled once and then only blended:
 * filling every edge was most of a hex or triangle page's drawing time on the tablet (#379,
 * device round 11).
 */
const lineMasks = new MaskCache(MASK_CACHE_LIMIT);

/** A straight line of `width` pixels from (x0, y0) to (x1, y1), as a filled quadrilateral. */
export function strokeLine(
  raster: Raster,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  tone: Tone,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return;
  const sx = Math.round(x0 * MASK_SUBPIXEL);
  const sy = Math.round(y0 * MASK_SUBPIXEL);
  const fx = ((sx % MASK_SUBPIXEL) + MASK_SUBPIXEL) % MASK_SUBPIXEL;
  const fy = ((sy % MASK_SUBPIXEL) + MASK_SUBPIXEL) % MASK_SUBPIXEL;
  const entry = lineMasks.get(`${dx} ${dy} ${width} ${fx} ${fy}`, () => {
    const nx = (-dy / length) * (width / 2);
    const ny = (dx / length) * (width / 2);
    const ox = fx / MASK_SUBPIXEL;
    const oy = fy / MASK_SUBPIXEL;
    return placedMask([[ox + nx, oy + ny, ox + dx + nx, oy + dy + ny, ox + dx - nx, oy + dy - ny, ox - nx, oy - ny]]);
  });
  paintMask(raster, entry.mask, (sx - fx) / MASK_SUBPIXEL + entry.left, (sy - fy) / MASK_SUBPIXEL + entry.top, tone);
}
