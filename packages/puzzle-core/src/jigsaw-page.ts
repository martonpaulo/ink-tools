/**
 * The jigsaw sudoku's page and its «Check» (#397): the grid, the region borders, the givens and the
 * footer drawn with the shared renderer, and the player's digits read and compared through the
 * shared check engine. The answer is never on the page.
 */
import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { JIGSAW_SIZE, type JigsawSudoku } from './jigsaw';
import { DIFFICULTY_LABELS, puzzleCode } from './code';
import {
  createPage,
  drawCellText,
  drawFooter,
  drawRegions,
  drawSquareLattice,
  layoutPage,
} from './page';
import type { CellPreset, Hand, Orientation, PageLayout, Raster } from './page';

export interface JigsawPageOptions {
  orientation?: Orientation;
  hand?: Hand;
  cellMm?: CellPreset;
}

const RULE = 'Fill each row, column and bold region with 1 to 9 once.';

/** Where the page puts the grid; `checkJigsaw` reads the player's ink from the same layout. */
export const jigsawLayout = (options: JigsawPageOptions = {}): PageLayout =>
  layoutPage({
    orientation: options.orientation ?? 'portrait',
    hand: options.hand ?? 'right',
    cellMm: options.cellMm ?? 10,
    lattice: 'square',
    columns: JIGSAW_SIZE,
    rows: JIGSAW_SIZE,
  });

/** The puzzle's page: givens only, never the solution. */
export function drawJigsawPage(puzzle: JigsawSudoku, options: JigsawPageOptions = {}): Raster {
  const layout = jigsawLayout(options);
  const page = createPage(layout);
  drawSquareLattice(page, layout.grid);
  drawRegions(page, layout.grid, (column, row) => puzzle.regions[row * JIGSAW_SIZE + column]);
  puzzle.givens.forEach((value, cell) => {
    if (value) drawCellText(page, layout.grid, cell % JIGSAW_SIZE, Math.floor(cell / JIGSAW_SIZE), String(value), 'given');
  });
  drawFooter(page, layout, { game: 'Jigsaw sudoku', difficulty: DIFFICULTY_LABELS[puzzle.id.difficulty], code: puzzleCode(puzzle.id), rule: RULE });
  return page;
}

/** The cells the player fills and the digit each must hold. */
export const jigsawExpected = (puzzle: JigsawSudoku): Map<number, string> =>
  new Map(puzzle.givens.flatMap((given, cell) => (given ? [] : [[cell, String(puzzle.solution[cell])] as [number, string]])));

/**
 * «Check»: reads the digits written on the page from its strokes and names the wrong cells, as the
 * cell indexes `row * 9 + column`. A cell the recogniser cannot read is `unread`, never `wrong`.
 */
export async function checkJigsaw<E>(
  puzzle: JigsawSudoku,
  strokes: readonly InkStroke<E>[],
  recognize: Recognize<E>,
  options: JigsawPageOptions = {},
): Promise<CheckResult> {
  const expected = jigsawExpected(puzzle);
  const reads = await readCells(jigsawLayout(options).grid, strokes, [...expected.keys()], recognize, 'digit');
  return checkCells(expected, reads, 'digit');
}
