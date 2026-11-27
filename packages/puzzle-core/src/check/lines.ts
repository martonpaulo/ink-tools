/**
 * The player's lines on a grid (#382): the edges a loop or a border draws, the cells a path
 * visits (mazes, bridges), and a straight strike over a word. Geometry only, no recognition.
 */
import type { Grid } from '../page/grid';
import { cellAt, densePoints, type InkPoint, type InkStroke } from './cells';

/**
 * [inference] shares of a cell, tuned in the device round: ink within this distance of an edge is
 * on it; an edge is drawn when its middle is this much covered; a path point this near a border is
 * in no cell; a strike bows at most this far from the line between its ends.
 */
export const EDGE_TOLERANCE = 0.2;
export const EDGE_MIN_COVER = 0.6;
export const PATH_MARGIN = 0.2;
export const STRIKE_MAX_BOW = 0.4;
/**
 * [inference] a point counts for an edge only while the pen runs along it: its step across the edge
 * is at most this share of its step along it, so a cross marked on an edge to rule it out draws
 * no edge (#391).
 */
export const EDGE_MAX_SLOPE = 0.5;
/** An edge's ends this near a lattice dot are left out, so a corner never draws two edges. */
const EDGE_END = 0.2;
/** The edge's middle is measured in this many parts. */
const EDGE_PARTS = 6;
/** Points are filled in at this share of the cell before they are measured. */
const LINE_STEP = 1 / 20;
/** The pen's way at a point is read over this many filled-in points on each side: the edge's tolerance. */
const SLOPE_REACH = Math.round(EDGE_TOLERANCE / LINE_STEP);

function requireSquare(grid: Grid, what: string): void {
  if (grid.lattice !== 'square') throw new Error(`${what} needs a square grid, not a ${grid.lattice} one`);
}

/**
 * The edges of a square grid the ink draws, as `h:c,r` (the top edge of cell c, r; r runs to
 * `rows` for the bottom border) and `v:c,r` (the left edge; c runs to `columns`).
 */
export function inkedEdges(grid: Grid, strokes: readonly InkStroke[]): Set<string> {
  requireSquare(grid, 'an edge check');
  const { columns, rows, cell } = grid;
  const parts = new Map<string, Set<number>>();
  const mark = (key: string, along: number): void => {
    const part = Math.floor((along - EDGE_END) / ((1 - 2 * EDGE_END) / EDGE_PARTS));
    if (part < 0 || part >= EDGE_PARTS) return;
    const set = parts.get(key) ?? new Set<number>();
    set.add(part);
    parts.set(key, set);
  };
  for (const stroke of strokes) {
    const points = densePoints(stroke.points, cell * LINE_STEP);
    points.forEach(({ x, y }, i) => {
      // The pen's way at this point, over the points an edge's tolerance away on each side, so a hand's wobble averages out.
      const [a, b] = [points[Math.max(0, i - SLOPE_REACH)], points[Math.min(points.length - 1, i + SLOPE_REACH)]];
      const [dx, dy] = [Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
      const u = (x - grid.x) / cell;
      const v = (y - grid.y) / cell;
      const line = Math.round(v);
      const column = Math.floor(u);
      if (dy <= dx * EDGE_MAX_SLOPE && Math.abs(v - line) <= EDGE_TOLERANCE && line >= 0 && line <= rows && column >= 0 && column < columns) {
        mark(`h:${column},${line}`, u - column);
      }
      const across = Math.round(u);
      const row = Math.floor(v);
      if (dx <= dy * EDGE_MAX_SLOPE && Math.abs(u - across) <= EDGE_TOLERANCE && across >= 0 && across <= columns && row >= 0 && row < rows) {
        mark(`v:${across},${row}`, v - row);
      }
    });
  }
  const drawn = new Set<string>();
  for (const [key, set] of parts) if (set.size >= EDGE_MIN_COVER * EDGE_PARTS) drawn.add(key);
  return drawn;
}

/** The square cell a path point is in, or null near a border, so a path along it does not jump cells. */
export function innerCellAt(grid: Grid, x: number, y: number): number | null {
  requireSquare(grid, 'a path check');
  const u = (x - grid.x) / grid.cell;
  const v = (y - grid.y) / grid.cell;
  const near = (t: number): boolean => t - Math.floor(t) < PATH_MARGIN || t - Math.floor(t) > 1 - PATH_MARGIN;
  return near(u) || near(v) ? null : cellAt(grid, x, y);
}

/**
 * The cells a drawn path visits, in order, a repeat of the last one dropped and a point in no cell
 * skipped. `locate` is the game's own: `innerCellAt` for a rectangle, a circle maze's for a circle.
 * The points are the pen's, about 4 px apart; a gap wider than a cell may skip one.
 */
export function pathCells<K>(points: readonly InkPoint[], locate: (x: number, y: number) => K | null): K[] {
  const visited: K[] = [];
  for (const { x, y } of points) {
    const key = locate(x, y);
    if (key !== null && key !== visited[visited.length - 1]) visited.push(key);
  }
  return visited;
}

/** A strike's two end cells and whether it is straight; null when an end is off the grid. */
export function strokeSpan(grid: Grid, stroke: InkStroke): { from: number; to: number; straight: boolean } | null {
  const { points } = stroke;
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const from = cellAt(grid, first.x, first.y);
  const to = cellAt(grid, last.x, last.y);
  if (from === null || to === null) return null;
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  const bow = (p: InkPoint): number =>
    length === 0
      ? Math.hypot(p.x - first.x, p.y - first.y)
      : Math.abs((last.x - first.x) * (first.y - p.y) - (first.x - p.x) * (last.y - first.y)) / length;
  const straight = points.every(p => bow(p) <= STRIKE_MAX_BOW * grid.cell);
  return { from, to, straight };
}

/**
 * [inference] a share of a cell, tuned in the device round: a stroke runs along a straight line when
 * its points within `STRIKE_MAX_BOW` of it, as straight as a strike, cover this much of its length.
 */
export const ALONG_MIN_COVER = 0.6;
/** A line's length is measured in this many parts per cell. */
const ALONG_PARTS_PER_CELL = 6;

/**
 * How many strokes run along the row or column segment between two square cells' facing borders,
 * such as the bridges drawn between two islands: a stroke counts when its points near the line cover
 * most of the segment, so a line that only crosses it, or a mark beside it, does not count.
 */
export function strokesAlong(grid: Grid, from: readonly [number, number], to: readonly [number, number], strokes: readonly InkStroke[]): number {
  requireSquare(grid, 'a line check');
  const [[c0, r0], [c1, r1]] = [from, to];
  if (c0 !== c1 && r0 !== r1) throw new Error(`cells ${c0},${r0} and ${c1},${r1} are not on one row or column`);
  const horizontal = r0 === r1;
  // In cell units: the line's position across, and the segment between the cells' facing borders.
  const across = (horizontal ? r0 : c0) + 1 / 2;
  const start = Math.min(horizontal ? c0 : r0, horizontal ? c1 : r1) + 1;
  const end = Math.max(horizontal ? c0 : r0, horizontal ? c1 : r1);
  const parts = Math.max(1, (end - start) * ALONG_PARTS_PER_CELL);
  let count = 0;
  for (const stroke of strokes) {
    const covered = new Set<number>();
    for (const { x, y } of densePoints(stroke.points, grid.cell * LINE_STEP)) {
      const u = (x - grid.x) / grid.cell;
      const v = (y - grid.y) / grid.cell;
      const [along, off] = horizontal ? [u, v] : [v, u];
      if (Math.abs(off - across) > STRIKE_MAX_BOW || along < start || along >= end) continue;
      covered.add(Math.floor(((along - start) / (end - start)) * parts));
    }
    if (covered.size >= ALONG_MIN_COVER * parts) count++;
  }
  return count;
}
