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
 * The player's strokes, so a marked page shows what was written beside each mark: in a mid grey,
 * so ink, the grid in black and the black rings read as three things.
 */
export function drawInk(raster: Raster, strokes: readonly InkStroke[]): void {
  for (const stroke of strokes) drawPolyline(raster, stroke.points.map(point => [point.x, point.y] as const), VIEW_INK_PX, 'strong');
}

/** A ring of `radius` around each centre: the mark «Check» puts on a wrong entry. */
export function drawRings(raster: Raster, centres: readonly (readonly [number, number])[], radius: number): void {
  for (const [cx, cy] of centres) {
    const ring = Array.from({ length: RING_CHORDS + 1 }, (_, i) => {
      const angle = (i / RING_CHORDS) * FULL_TURN;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
    });
    drawPolyline(raster, ring, VIEW_MARK_PX);
  }
}

/** The centre of each cell, named `row * columns + column` as the games name them. */
const centres = (grid: Grid, cells: readonly number[]): [number, number][] =>
  cells.map(cell => cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns)));

/**
 * The page a cell game's «Check» shows (#397): the player's ink, and a ring around each wrong cell.
 * `wrong` holds cell indexes, as `checkCells` names them.
 */
export function drawCellCheck(page: Raster, grid: Grid, strokes: readonly InkStroke[], wrong: readonly number[]): Raster {
  const marked = copyRaster(page);
  drawInk(marked, strokes);
  drawRings(marked, centres(grid, wrong), grid.cell * VIEW_MARK_SHARE);
  return marked;
}

/**
 * The page with a cell game's answer written in (#397), for the plugin's view only: each value in
 * its cell in a mid grey and a regular weight, so the givens in bold black still read as the puzzle's.
 */
export function drawCellAnswers(page: Raster, grid: Grid, answers: ReadonlyMap<number, string>): Raster {
  const answer = copyRaster(page);
  const style = { size: Math.round(grid.cell * TEXT_SIZE.given), weight: FONT_WEIGHTS.regular, tone: 'strong' } as const;
  const cells = [...answers.keys()];
  centres(grid, cells).forEach(([x, y], i) => drawCentredText(answer, answers.get(cells[i]) as string, x, y, style));
  return answer;
}
