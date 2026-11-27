/**
 * The pictures the Puzzles view shows over a game page (#386): the player's ink, the marks
 * «Check» puts on wrong entries, and a game's answer line. They are drawn on a copy of the page and
 * shown only in the plugin's view; nothing here is written to the note, so the answer never reaches it.
 */
import { type InkStroke } from '../check/cells';
import { drawCentredText, FONT_WEIGHTS } from './font';
import { cellCenter, type Cell, type Grid } from './grid';
import { TEXT_SIZE, type Tone } from './look';
import { type Raster, strokeLine } from './raster';

/** The player's ink as the view draws it: the tablet's thinnest pen is about this wide. */
export const VIEW_INK_PX = 3;
/** A «Check» mark: a ring this wide around each wrong entry. */
export const VIEW_MARK_PX = 6;
/** An answer line, wider than the ink so the two never read as one. */
export const VIEW_ANSWER_PX = 8;
/** The ring around a wrong cell, as a share of the cell: most of it, so it never hides the next cell's ink. */
export const VIEW_MARK_SHARE = 0.4;
/**
 * The mark around a wrong edge: a capsule along it as long as a cell's ring is wide and half as
 * wide, so it is as easy to find as a cell's ring and the counts beside the edge stay clear (#391).
 */
export const VIEW_EDGE_MARK = { length: 2 * VIEW_MARK_SHARE, width: VIEW_MARK_SHARE } as const;
/**
 * A cell whose top-left corner holds a label (a cage's sum or sign): its answer and its ring sit
 * this share of the cell lower and further right, at this scale, so they never cover the label (#388).
 */
export const LABELLED_CELL = { shift: 0.12, scale: 0.75 } as const;
/** The cells a cage game labels: each cage's top-left cell, the first in reading order, as `drawCage` puts it. */
export const cageLabelCells = (cages: readonly { cells: readonly number[] }[]): Set<number> => new Set(cages.map(cage => Math.min(...cage.cells)));
/** A ring is drawn in this many chords. */
const RING_CHORDS = 36;
const FULL_TURN = 2 * Math.PI;

/** A copy of the page to draw on, so the page itself stays as it is inserted. */
export function copyRaster(raster: Raster): Raster {
  // The copy keeps no row flags: rows painted on it are then compared by the PNG encoder.
  return { width: raster.width, height: raster.height, pixels: raster.pixels.slice() };
}

/** A polyline through `points`, `width` pixels wide. */
export function drawPolyline(raster: Raster, points: readonly (readonly [number, number])[], width: number, tone: Tone = 'ink'): void {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    strokeLine(raster, x0, y0, x1, y1, width, tone);
  }
}

/**
 * The player's strokes, so a marked page shows what was written beside each mark: in the `pen`
 * grey, so ink, the grid and the black rings read as three things (#397).
 */
export function drawInk(raster: Raster, strokes: readonly InkStroke[]): void {
  for (const stroke of strokes) drawPolyline(raster, stroke.points.map(point => [point.x, point.y] as const), VIEW_INK_PX, 'pen');
}

/**
 * A ring of `radius` around each centre: the mark «Check» puts on a wrong entry. A dashed ring,
 * every other chord, marks an entry it could not read (#397).
 */
export function drawRings(raster: Raster, centres: readonly (readonly [number, number])[], radius: number, dashed = false): void {
  for (const [cx, cy] of centres) {
    const ring = Array.from({ length: RING_CHORDS + 1 }, (_, i) => {
      const angle = (i / RING_CHORDS) * FULL_TURN;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
    });
    if (!dashed) drawPolyline(raster, ring, VIEW_MARK_PX);
    else for (let i = 0; i < RING_CHORDS; i += 2) drawPolyline(raster, ring.slice(i, i + 2), VIEW_MARK_PX);
  }
}

/** The centre of each cell, named `row * columns + column` as the games name them. */
const centres = (grid: Grid, cells: readonly number[]): [number, number][] =>
  cells.map(cell => cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns)));

/** Where a cell's answer or ring centres: its centre, or lower right of it in a labelled cell. */
const markAt = (grid: Grid, cell: number, labelled: ReadonlySet<number>): [number, number] => {
  const [x, y] = centres(grid, [cell])[0];
  const shift = labelled.has(cell) ? grid.cell * LABELLED_CELL.shift : 0;
  return [x + shift, y + shift];
};
const scaleAt = (cell: number, labelled: ReadonlySet<number>): number => (labelled.has(cell) ? LABELLED_CELL.scale : 1);

/** A ring around each of `cells`, smaller and lower right in a labelled cell. */
function ringCells(raster: Raster, grid: Grid, cells: readonly number[], labelled: ReadonlySet<number>, dashed: boolean): void {
  for (const cell of cells) drawRings(raster, [markAt(grid, cell, labelled)], grid.cell * VIEW_MARK_SHARE * scaleAt(cell, labelled), dashed);
}

/**
 * The page a game's «Check» shows over points of its own (#391): the player's ink, a ring of
 * `radius` around each wrong point and a dashed one around each point it could not read.
 */
export function drawPointCheck(
  page: Raster,
  strokes: readonly InkStroke[],
  wrong: readonly (readonly [number, number])[],
  radius: number,
  unread: readonly (readonly [number, number])[] = [],
): Raster {
  const marked = copyRaster(page);
  drawInk(marked, strokes);
  drawRings(marked, wrong, radius);
  drawRings(marked, unread, radius, true);
  return marked;
}

/**
 * The page a cell game's «Check» shows (#397): the player's ink, a ring around each wrong cell and
 * a dashed ring around each cell it could not read. Both hold cell indexes, as `checkCells` names them;
 * `labelled` names the cells whose corner label a ring must leave clear (#388).
 */
export function drawCellCheck(
  page: Raster,
  grid: Grid,
  strokes: readonly InkStroke[],
  wrong: readonly number[],
  unread: readonly number[] = [],
  labelled: ReadonlySet<number> = new Set(),
): Raster {
  const marked = drawPointCheck(page, strokes, [], 0);
  ringCells(marked, grid, wrong, labelled, false);
  ringCells(marked, grid, unread, labelled, true);
  return marked;
}

/**
 * The page with a cell game's answer written in (#397), for the plugin's view only: each value in
 * its cell in the grid lines' grey and a regular weight, so the givens in bold black still read as the puzzle's.
 * `labelled` names the cells whose corner label the answer must leave clear (#388).
 */
export function drawCellAnswers(page: Raster, grid: Grid, answers: ReadonlyMap<number, string>, labelled: ReadonlySet<number> = new Set()): Raster {
  const answer = copyRaster(page);
  for (const [cell, text] of answers) {
    const [x, y] = markAt(grid, cell, labelled);
    const style = { size: Math.round(grid.cell * TEXT_SIZE.given * scaleAt(cell, labelled)), weight: FONT_WEIGHTS.regular, tone: 'line' } as const;
    drawCentredText(answer, text, x, y, style);
  }
  return answer;
}

/**
 * The two lattice points of a square grid's edge, as `inkedEdges` names it: `h:c,r`, the top of
 * cell c, r, or `v:c,r`, its left side.
 */
export function edgeEnds(grid: Grid, key: string): [[number, number], [number, number]] {
  const match = /^([hv]):(\d+),(\d+)$/.exec(key);
  if (!match) throw new RangeError(`«${key}» is not an edge key`);
  const [column, row] = [Number(match[2]), Number(match[3])];
  const at = (c: number, r: number): [number, number] => [grid.x + c * grid.cell, grid.y + r * grid.cell];
  return match[1] === 'h' ? [at(column, row), at(column + 1, row)] : [at(column, row), at(column, row + 1)];
}

/** A line between two points, such as an edge or a link. */
export type Segment = readonly [readonly [number, number], readonly [number, number]];

/** A capsule around a line's middle, along it, as a closed polyline: a half ring at each end, joined along the line. */
function lineCapsule(grid: Grid, [[x0, y0], [x1, y1]]: Segment): [number, number][] {
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const axis = Math.atan2(y1 - y0, x1 - x0);
  const radius = (grid.cell * VIEW_EDGE_MARK.width) / 2;
  const reach = (grid.cell * VIEW_EDGE_MARK.length) / 2 - radius;
  const half = RING_CHORDS / 2;
  const points: [number, number][] = [];
  for (const side of [1, -1]) {
    const [ex, ey] = [cx + side * reach * Math.cos(axis), cy + side * reach * Math.sin(axis)];
    const from = axis - (side * Math.PI) / 2;
    for (let i = 0; i <= half; i++) {
      const angle = from + (i / half) * Math.PI;
      points.push([ex + radius * Math.cos(angle), ey + radius * Math.sin(angle)]);
    }
  }
  return [...points, points[0]];
}

/**
 * The page an edges or links game's «Check» shows (#391, #396): the player's ink and a capsule along
 * the middle of each wrong line, so it never reads as a cell's ring or an island.
 */
export function drawLineCheck(page: Raster, grid: Grid, strokes: readonly InkStroke[], wrong: readonly Segment[]): Raster {
  const marked = drawPointCheck(page, strokes, [], 0);
  for (const line of wrong) drawPolyline(marked, lineCapsule(grid, line), VIEW_MARK_PX);
  return marked;
}

/**
 * The page with an edges game's answer drawn (#391), for the plugin's view only: each edge as a
 * line as wide as the maze's answer, so it never reads as the player's ink.
 */
export function drawEdgeAnswers(page: Raster, grid: Grid, edges: readonly string[]): Raster {
  const answer = copyRaster(page);
  for (const key of edges) drawPolyline(answer, edgeEnds(grid, key), VIEW_ANSWER_PX);
  return answer;
}

/** One link of a links game's answer (#396): the two cells it joins and how many lines it takes. */
export interface LinkAnswer {
  readonly from: Cell;
  readonly to: Cell;
  readonly count: number;
}

/** Two lines of one link sit this share of a cell apart, inside the islands' rings at both ends. */
export const VIEW_LINK_GAP = VIEW_MARK_SHARE / 2;

/** A link's line between the rims of its two cells' icons, `offset` pixels to one side. */
export function linkLine(grid: Grid, from: Cell, to: Cell, offset = 0): [[number, number], [number, number]] {
  const [ax, ay] = cellCenter(grid, ...from);
  const [bx, by] = cellCenter(grid, ...to);
  const length = Math.hypot(bx - ax, by - ay);
  const [ux, uy] = [(bx - ax) / length, (by - ay) / length];
  const rim = (grid.cell * TEXT_SIZE.icon) / 2;
  const [ox, oy] = [-uy * offset, ux * offset];
  return [
    [ax + ux * rim + ox, ay + uy * rim + oy],
    [bx - ux * rim + ox, by - uy * rim + oy],
  ];
}

/** The page with a links game's answer drawn (#396), for the plugin's view only: one or two lines a link, none for 0. */
export function drawLinkAnswers(page: Raster, grid: Grid, links: readonly LinkAnswer[]): Raster {
  const answer = copyRaster(page);
  const gap = grid.cell * VIEW_LINK_GAP;
  for (const { from, to, count } of links) {
    // The lines of a link sit side by side, centred on the line between the cells.
    for (let i = 0; i < count; i++) drawPolyline(answer, linkLine(grid, from, to, (i - (count - 1) / 2) * gap), VIEW_ANSWER_PX);
  }
  return answer;
}
