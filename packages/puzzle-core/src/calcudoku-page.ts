/**
 * A calcudoku's page and its «Check» (#388): the grid drawn with the shared renderer, each cage
 * a thick border with its label in its first cell, and the player's digits read back with the
 * shared ink check. The page carries no answer.
 */
import { cageLabel, type Calcudoku } from './calcudoku';
import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { drawCellText, drawRegions, drawSquareLattice } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type PageLayout } from './page/layout';
import { type CellPreset, type Hand, type Orientation } from './page/look';
import { type Raster } from './page/raster';
import { puzzleCode } from './code';

export interface CalcudokuPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** The cell preset; the largest that fits when absent. */
  cellMm?: CellPreset;
}

/** The footer's game name and band names, as the page prints them. */
const BAND_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' } as const;
const GAME_NAME = 'Calcudoku';

/** The one-line rule of the footer. */
export const calcudokuRule = (size: number): string =>
  `Put 1 to ${size} once in each row and column; each cage makes its number with its sign.`;

/** The puzzle's page: its layout, for «Check», and its raster, for `encodePng`. */
export function drawCalcudokuPage(puzzle: Calcudoku, options: CalcudokuPageOptions): { layout: PageLayout; raster: Raster } {
  const { size, cages } = puzzle;
  const spec = { orientation: options.orientation, hand: options.hand, lattice: 'square', columns: size, rows: size } as const;
  const layout = layoutPage({ ...spec, cellMm: options.cellMm ?? fitCellMm(spec) });
  const raster = createPage(layout);
  const cageOf = new Array<number>(size * size);
  cages.forEach((cage, k) => cage.cells.forEach(cell => (cageOf[cell] = k)));
  drawSquareLattice(raster, layout.grid);
  drawRegions(raster, layout.grid, (column, row) => cageOf[row * size + column]);
  for (const cage of cages) {
    const first = Math.min(...cage.cells);
    drawCellText(raster, layout.grid, first % size, Math.floor(first / size), cageLabel(cage), 'clue');
  }
  drawFooter(raster, layout, {
    game: GAME_NAME,
    difficulty: BAND_NAMES[puzzle.id.difficulty],
    code: puzzleCode(puzzle.id),
    rule: calcudokuRule(size),
  });
  return { layout, raster };
}

/**
 * «Check»: reads every cell's digit from the page's strokes and compares it with the solution.
 * Every cell is the player's to fill, a one-cell cage too: its label is a clue, not a given.
 */
export async function checkCalcudoku<E>(
  puzzle: Calcudoku,
  layout: PageLayout,
  strokes: readonly InkStroke<E>[],
  recognize: Recognize<E>,
): Promise<CheckResult> {
  const cells = puzzle.solution.map((_, i) => i);
  const reads = await readCells(layout.grid, strokes, cells, recognize, 'digit');
  const expected = new Map(puzzle.solution.map((value, i) => [i, String(value)] as const));
  return checkCells(expected, reads, 'digit');
}
