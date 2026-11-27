/**
 * The pictures the Puzzles view shows over a game page (#386): the player's ink, the marks
 * «Check» puts on wrong entries, and a game's answer line. They are drawn on a copy of the page and
 * shown only in the plugin's view; nothing here is written to the note, so the answer never reaches it.
 */
import { type InkStroke } from '../check/cells';
import { drawCentredText, FONT_WEIGHTS } from './font';
import { cellCenter, type Grid } from './grid';
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
  const marked = copyRaster(page);
  drawInk(marked, strokes);
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
