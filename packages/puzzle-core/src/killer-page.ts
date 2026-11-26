/**
 * A killer sudoku's page and its «Check» (#387): the shared renderer draws the grid, the boxes,
 * each cage with its sum and any given; the shared ink check reads the digits the player wrote and
 * names the wrong cells. The answers are never drawn on the page.
 */
import { puzzleCode } from './code';
import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { type KillerSudoku } from './killer';
import { drawCage, drawCellText, drawRegions, drawSquareLattice, type Grid } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type PageLayout } from './page/layout';
import { type CellPreset, type Hand, type Orientation } from './page/look';
import { type Raster } from './page/raster';

export interface KillerPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** The cell preset; the largest that fits when left out. */
  cellMm?: CellPreset;
}

export const KILLER_FOOTER = { game: 'Killer sudoku', rule: 'Put 1 to 9 once in each row, column and box; each cage adds up to its sum, no digit twice.' } as const;

const BAND_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' } as const;

/** The puzzle's page: the raster to encode as the page background, and its layout for «Check». */
export function drawKillerPage(puzzle: KillerSudoku, options: KillerPageOptions): { layout: PageLayout; raster: Raster } {
  const n = puzzle.shape.size;
  const base = { orientation: options.orientation, hand: options.hand, lattice: 'square' as const, columns: n, rows: n };
  const layout = layoutPage({ ...base, cellMm: options.cellMm ?? fitCellMm(base) });
  const raster = createPage(layout);
  const { grid } = layout;
  const { boxRows, boxCols } = puzzle.shape;
  drawSquareLattice(raster, grid);
  drawRegions(raster, grid, (c, r) => Math.floor(c / boxCols) + (n / boxCols) * Math.floor(r / boxRows));
  for (const cage of puzzle.cages) {
    drawCage(raster, grid, cage.cells.map(cell => [cell % n, Math.floor(cell / n)] as const), String(cage.sum));
  }
  puzzle.givens.forEach((v, i) => v > 0 && drawCellText(raster, grid, i % n, Math.floor(i / n), String(v), 'given'));
  drawFooter(raster, layout, { ...KILLER_FOOTER, difficulty: BAND_NAMES[puzzle.id.difficulty], code: puzzleCode(puzzle.id) });
  return { layout, raster };
}

/**
 * «Check» of a hand-solved killer page: reads every cell that is not a given from the page's
 * strokes, one recogniser call per row, and compares it with the solution. Wrong, empty and
 * unread cells come back apart, so an unread cell is never marked wrong.
 */
export async function checkKiller<E>(puzzle: KillerSudoku, grid: Grid, strokes: readonly InkStroke<E>[], recognize: Recognize<E>): Promise<CheckResult> {
  const n = puzzle.shape.size;
  if (grid.columns !== n || grid.rows !== n) throw new Error(`a ${n} x ${n} killer sudoku is checked on its own grid, not a ${grid.columns} x ${grid.rows} one`);
  const cells = puzzle.givens.flatMap((v, i) => (v === 0 ? [i] : []));
  const reads = await readCells(grid, strokes, cells, recognize, 'digit');
  return checkCells(new Map(cells.map(i => [i, String(puzzle.solution[i])])), reads, 'digit');
}
