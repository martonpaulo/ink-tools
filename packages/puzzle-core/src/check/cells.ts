/**
 * Which grid cell the player's ink is in, and what kind of mark it is (#382). The strokes come from
 * the page as points in page pixels, the grid from `layoutPage`; nothing here calls the device or a
 * recogniser. A cell is named by its index, `row * columns + column`, as the games name it.
 */
import { cellCenter, cellPolygon, type Grid } from '../page/grid';

export type InkPoint = { readonly x: number; readonly y: number };

/** One stroke of the player's ink: its points in page pixels and the host's element, passed through. */
export interface InkStroke<E = unknown> {
  readonly points: readonly InkPoint[];
  readonly element: E;
}

/** What a cell's ink is, without recognition. `other` is anything else, such as a written digit. */
export type Mark = 'empty' | 'dot' | 'cross' | 'shade' | 'other';

/**
 * [inference] shares of the cell, tuned in the device round: a dot fits in this share of the cell;
 * a shade covers this share of the cell's sub-squares; each line of a cross is at least this long.
 */
export const DOT_MAX_SHARE = 0.3;
export const SHADE_MIN_COVER = 0.3;
export const CROSS_MIN_SPAN = 0.4;
/** [inference] the share of each line of a cross, from either end, where the other line may not meet it: lines that only touch there are a zigzag's teeth. */
const CROSS_END_SHARE = 0.1;
/**
 * [inference] a share of the cell: a piece of a stroke that never gets this deep into a cell, from
 * its nearest side, is a neighbour's mark spilling over the border, not a mark of this cell (#384).
 */
export const SPILL_DEPTH = 0.15;
/** The sub-squares a cell is divided into, per side, to measure how much ink covers it. */
const COVER_STEPS = 12;
/** A segment counts as diagonal within 20 degrees of a quarter turn's half, in radians. */
const DIAGONAL_TOLERANCE = Math.PI / 9;
const DIAGONAL = Math.PI / 4;
/** Points are filled in along a segment at this share of the cell, so coverage misses no sub-square. */
const DENSE_SHARE = 1 / (2 * COVER_STEPS);
/** How far one row's centres sit below the last, as a share of the cell: as `grid.ts` lays them out. */
const ROW_STEP_SHARE = { square: 1, hex: Math.sqrt(3) / 2, triangle: Math.sqrt(3) / 2 } as const;

export const cellIndex = (grid: Grid, column: number, row: number): number => row * grid.columns + column;

/** True when the point is inside the flat polygon `[x0, y0, x1, y1, ...]`. */
function inside(polygon: readonly number[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [polygon[i], polygon[i + 1], polygon[j], polygon[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The cell index a point is in, or null off the grid. */
export function cellAt(grid: Grid, x: number, y: number): number | null {
  const { columns, rows, cell } = grid;
  if (grid.lattice === 'square') {
    const column = Math.floor((x - grid.x) / cell);
    const row = Math.floor((y - grid.y) / cell);
    return column >= 0 && column < columns && row >= 0 && row < rows ? cellIndex(grid, column, row) : null;
  }
  // Hex and triangle cells: the cell whose centre is nearest, checked against its outline, among
  // the few cells around the point's row and column.
  const [x0, y0] = cellCenter(grid, 0, 0);
  // A hex column is one cell wide; a triangle column is half a side. Rows step by a cell at most.
  const columnStep = grid.lattice === 'hex' ? cell : cell / 2;
  const rowStep = cell * ROW_STEP_SHARE[grid.lattice];
  const columnGuess = Math.round((x - x0) / columnStep);
  const rowGuess = Math.round((y - y0) / rowStep);
  for (let row = rowGuess - 1; row <= rowGuess + 1; row++) {
    if (row < 0 || row >= rows) continue;
    for (let column = columnGuess - 2; column <= columnGuess + 2; column++) {
      if (column < 0 || column >= columns) continue;
      if (inside(cellPolygon(grid, column, row), x, y)) return cellIndex(grid, column, row);
    }
  }
  return null;
}

/**
 * Each stroke in the cell that holds most of its points, so a digit written across a border is
 * read once, in one cell. A stroke with no point on the grid, such as a note in the footer, is left out.
 */
export function strokesByCell<E>(grid: Grid, strokes: readonly InkStroke<E>[]): Map<number, InkStroke<E>[]> {
  const byCell = new Map<number, InkStroke<E>[]>();
  for (const stroke of strokes) {
    const counts = new Map<number, number>();
    for (const { x, y } of stroke.points) {
      const index = cellAt(grid, x, y);
      if (index !== null) counts.set(index, (counts.get(index) ?? 0) + 1);
    }
    let best: number | null = null;
    for (const [index, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = index;
    if (best === null) continue;
    const list = byCell.get(best);
    if (list) list.push(stroke);
    else byCell.set(best, [stroke]);
  }
  return byCell;
}

/**
 * Each cell's ink for a game of marks (#384): every stroke cut where it crosses a cell border, so
 * a run shaded or struck through in one stroke marks each cell it covers. A piece that only spills
 * over a border, never `SPILL_DEPTH` into its cell, is left out, as is ink off the grid.
 */
export function marksByCell<E>(grid: Grid, strokes: readonly InkStroke<E>[]): Map<number, InkStroke<E>[]> {
  const byCell = new Map<number, InkStroke<E>[]>();
  const keep = (index: number | null, points: InkPoint[], element: E): void => {
    if (index === null || points.length === 0) return;
    const box = cellBounds(grid, index);
    const depth = (p: InkPoint): number => Math.min(p.x - box.left, box.right - p.x, p.y - box.top, box.bottom - p.y);
    if (!points.some(p => depth(p) >= SPILL_DEPTH * grid.cell)) return;
    byCell.set(index, [...(byCell.get(index) ?? []), { points, element }]);
  };
  for (const stroke of strokes) {
    let at: number | null = null;
    let piece: InkPoint[] = [];
    for (const point of densePoints(stroke.points, grid.cell * DENSE_SHARE)) {
      const index = cellAt(grid, point.x, point.y);
      if (index !== at) {
        keep(at, piece, stroke.element);
        [at, piece] = [index, []];
      }
      piece.push(point);
    }
    keep(at, piece, stroke.element);
  }
  return byCell;
}

/** The points of a polyline with one at least every `step` px along each segment. */
export function densePoints(points: readonly InkPoint[], step: number): InkPoint[] {
  if (points.length < 2) return [...points];
  const dense: InkPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= parts; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / parts, y: a.y + ((b.y - a.y) * k) / parts });
  }
  return dense;
}

type Bounds = { left: number; top: number; right: number; bottom: number };

function boundsOf(points: readonly InkPoint[]): Bounds {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of points) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom };
}

/** The cell's own bounds, from its outline. */
function cellBounds(grid: Grid, index: number): Bounds {
  const polygon = cellPolygon(grid, index % grid.columns, Math.floor(index / grid.columns));
  const points: InkPoint[] = [];
  for (let i = 0; i < polygon.length; i += 2) points.push({ x: polygon[i], y: polygon[i + 1] });
  return boundsOf(points);
}

/** The share of the cell's sub-squares that some ink passes through. */
function coverOf(strokes: readonly InkStroke[], box: Bounds, size: number): number {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const touched = new Set<number>();
  for (const stroke of strokes) {
    for (const { x, y } of densePoints(stroke.points, size * DENSE_SHARE)) {
      const column = Math.floor(((x - box.left) / width) * COVER_STEPS);
      const row = Math.floor(((y - box.top) / height) * COVER_STEPS);
      if (column >= 0 && column < COVER_STEPS && row >= 0 && row < COVER_STEPS) touched.add(row * COVER_STEPS + column);
    }
  }
  return touched.size / (COVER_STEPS * COVER_STEPS);
}

/** A straight run of ink along one diagonal: where it starts and ends, and its length along the ink. */
interface DiagonalRun {
  readonly band: 'falling' | 'rising';
  readonly from: InkPoint;
  readonly to: InkPoint;
  readonly length: number;
}

/**
 * The straight runs of ink along each diagonal, falling (top left to bottom right on the page) and
 * rising. A run is consecutive segments in one diagonal band, so the arcs of a written 0 or 8,
 * which turn through every direction, never add up to a cross.
 */
function diagonalRuns(strokes: readonly InkStroke[]): DiagonalRun[] {
  const runs: DiagonalRun[] = [];
  for (const { points } of strokes) {
    let current: { band: 'falling' | 'rising'; from: InkPoint; to: InkPoint; length: number } | null = null;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      // The segment's angle folded into a half turn, 0 to pi; page y grows downward.
      const angle = (Math.atan2(dy, dx) + Math.PI) % Math.PI;
      const band =
        Math.abs(angle - DIAGONAL) <= DIAGONAL_TOLERANCE
          ? 'falling'
          : Math.abs(angle - (Math.PI - DIAGONAL)) <= DIAGONAL_TOLERANCE
            ? 'rising'
            : null;
      if (current && band === current.band) {
        current.to = points[i];
        current.length += length;
        continue;
      }
      if (current) runs.push(current);
      current = band ? { band, from: points[i - 1], to: points[i], length } : null;
    }
    if (current) runs.push(current);
  }
  return runs;
}

/** How far along each of two runs they meet, 0 at its start and 1 at its end, or null when parallel. */
function meeting(a: DiagonalRun, b: DiagonalRun): [number, number] | null {
  const ax = a.to.x - a.from.x;
  const ay = a.to.y - a.from.y;
  const bx = b.to.x - b.from.x;
  const by = b.to.y - b.from.y;
  const det = ax * by - ay * bx;
  if (det === 0) return null;
  const cx = b.from.x - a.from.x;
  const cy = b.from.y - a.from.y;
  return [(cx * by - cy * bx) / det, (cx * ay - cy * ax) / det];
}

/**
 * Whether a falling and a rising run, each at least `span` long, cross each other: a cross is two
 * lines through one another. A zigzag's teeth meet only at their ends, so a shading zigzag whose
 * teeth lean as far as a diagonal is never read as a cross (tablet shift 7: 22 px teeth in 83 px
 * cells read as 47 crosses, #384).
 */
function crossed(strokes: readonly InkStroke[], span: number): boolean {
  const runs = diagonalRuns(strokes).filter(run => run.length >= span);
  const inside = (t: number) => t > CROSS_END_SHARE && t < 1 - CROSS_END_SHARE;
  return runs.some(
    a =>
      a.band === 'falling' &&
      runs.some(b => {
        if (b.band !== 'rising') return false;
        const at = meeting(a, b);
        return at !== null && inside(at[0]) && inside(at[1]);
      }),
  );
}

/**
 * The kind of mark a cell's strokes make, in this order: none, a dot, a shade, a cross, else other.
 * A cross smaller than a dot counts as a dot; the letter x counts as a cross, so a letter game reads
 * its cells with `readCells`, never with this.
 */
export function classifyMark(grid: Grid, index: number, strokes: readonly InkStroke[]): Mark {
  const points = strokes.flatMap(stroke => stroke.points);
  if (points.length === 0) return 'empty';
  const box = cellBounds(grid, index);
  const size = Math.max(box.right - box.left, box.bottom - box.top);
  const ink = boundsOf(points);
  if (Math.max(ink.right - ink.left, ink.bottom - ink.top) <= DOT_MAX_SHARE * size) return 'dot';
  if (coverOf(strokes, box, size) >= SHADE_MIN_COVER) return 'shade';
  if (crossed(strokes, CROSS_MIN_SPAN * size)) return 'cross';
  return 'other';
}
