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
  return { width, height, pixels: new Uint8Array(width * height).fill(TONES.paper) };
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

function blend(raster: Raster, index: number, grey: number, coverage: number): void {
  if (coverage <= 0) return;
  const current = raster.pixels[index];
  raster.pixels[index] = coverage >= 1 ? grey : snap(current + (grey - current) * coverage);
}

/** A rectangle on whole pixels, clipped to the page. */
export function fillRect(raster: Raster, x: number, y: number, width: number, height: number, tone: Tone): void {
  if (![x, y, width, height].every(Number.isInteger)) {
    throw new Error(`a rectangle sits on whole pixels, not at ${x}, ${y}, ${width} x ${height}`);
  }
  const grey = TONES[tone];
  const left = Math.max(0, x);
  const right = Math.min(raster.width, x + width);
  const top = Math.max(0, y);
  const bottom = Math.min(raster.height, y + height);
  for (let row = top; row < bottom; row++) {
    raster.pixels.fill(grey, row * raster.width + left, row * raster.width + right);
  }
}

/** Gives the covered spans [from, to) of one sub-row at height `y`, in any order. */
type SpanSource = (y: number, add: (from: number, to: number) => void) => void;

/** Paints `tone` over the spans each sub-row of rows [top, bottom) gives, blending partial pixels. */
function paintSpans(raster: Raster, top: number, bottom: number, tone: Tone, spans: SpanSource): void {
  const grey = TONES[tone];
  const firstRow = Math.max(0, Math.floor(top));
  const lastRow = Math.min(raster.height, Math.ceil(bottom));
  const coverage = new Float64Array(raster.width + 1);
  let minX = raster.width;
  let maxX = -1;
  const add = (from: number, to: number) => {
    const a = Math.max(0, from);
    const b = Math.min(raster.width, to);
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
    const end = Math.min(maxX, raster.width - 1);
    for (let x = minX; x <= end; x++) {
      blend(raster, row * raster.width + x, grey, coverage[x]);
      coverage[x] = 0;
    }
    coverage[raster.width] = 0;
    minX = raster.width;
    maxX = -1;
  }
}

/**
 * Fills polygons by the non-zero rule. Each contour is a flat list x0, y0, x1, y1, ... in page
 * pixels, closed back to its first point; contours of one call make one shape (a glyph's holes).
 */
export function fillPolygon(raster: Raster, contours: readonly (readonly number[])[], tone: Tone): void {
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
  if (edges.length === 0) return;
  // Each pixel row lists the edges that reach it, so a sub-row tests only those, not every edge
  // of a glyph: text is most of a page's drawing time on the tablet.
  const firstRow = Math.max(0, Math.floor(top));
  const byRow: number[][] = [];
  for (let e = 0; e < edges.length; e += EDGE.size) {
    const from = Math.max(firstRow, Math.floor(Math.min(edges[e + EDGE.y0], edges[e + EDGE.y1])));
    const to = Math.min(raster.height - 1, Math.floor(Math.max(edges[e + EDGE.y0], edges[e + EDGE.y1])));
    for (let row = from; row <= to; row++) (byRow[row - firstRow] ??= []).push(e);
  }
  const xs: number[] = [];
  const dirs: number[] = [];
  paintSpans(raster, top, bottom, tone, (y, add) => {
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
  });
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
  const nx = (-dy / length) * (width / 2);
  const ny = (dx / length) * (width / 2);
  fillPolygon(raster, [[x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny]], tone);
}
