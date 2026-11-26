/**
 * Classic sudoku as a Puzzles game (#383): the page the plugin inserts, drawn with the shared
 * renderer, and its «Check» rule over the shared ink check. The puzzle itself comes from
 * `generateSudoku`; the visible words (game name, band, rule) come from the caller, which owns
 * the copy.
 */
import { type CellRead, type CheckResult, type Recognize, checkCells, readCells, type Alphabet } from './check/read';
import { type InkStroke } from './check/cells';
import { puzzleCode } from './code';
import { drawCellText, drawRegions, drawSquareLattice } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type FooterText, type PageLayout } from './page/layout';
import { type Hand, type Orientation } from './page/look';
import { encodePng } from './page/png';
import { type Raster } from './page/raster';
import { type Sudoku } from './sudoku';

export interface SudokuPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** The footer's words; the puzzle code is added here, so the page and its code never disagree. */
  text: Omit<FooterText, 'code'>;
}

export interface SudokuPage {
  readonly layout: PageLayout;
  readonly raster: Raster;
}

/** The layout of a sudoku page: its square grid at the largest cell preset that fits the page. */
export function sudokuLayout(puzzle: Sudoku, orientation: Orientation, hand: Hand): PageLayout {
  const side = puzzle.shape.size;
  const spec = { orientation, hand, lattice: 'square' as const, columns: side, rows: side };
  return layoutPage({ ...spec, cellMm: fitCellMm(spec) });
}

/** The box a cell is in, numbered row by row, for the thick region borders. */
const boxOf = (puzzle: Sudoku) => (column: number, row: number): number =>
  Math.floor(row / puzzle.shape.boxRows) * (puzzle.shape.size / puzzle.shape.boxCols) + Math.floor(column / puzzle.shape.boxCols);

/** Draws the page: the grid, the box borders, the givens and the footer. The solution is never drawn. */
export function drawSudokuPage(puzzle: Sudoku, options: SudokuPageOptions): SudokuPage {
  const layout = sudokuLayout(puzzle, options.orientation, options.hand);
  const raster = createPage(layout);
  const side = puzzle.shape.size;
  drawSquareLattice(raster, layout.grid);
  drawRegions(raster, layout.grid, boxOf(puzzle));
  puzzle.givens.forEach((value, i) => {
    if (value > 0) drawCellText(raster, layout.grid, i % side, Math.floor(i / side), String(value), 'given');
  });
  drawFooter(raster, layout, { ...options.text, code: puzzleCode(puzzle.id) });
  return { layout, raster };
}

/** The page as PNG bytes, for a `MyStyle/` page background. */
export const sudokuPagePng = (puzzle: Sudoku, options: SudokuPageOptions): Uint8Array => encodePng(drawSudokuPage(puzzle, options).raster);

/** The largest value one digit holds; a bigger grid has values of two digits. */
const LARGEST_DIGIT = 9;

/** What a cell holds: one digit up to 9 x 9, a number of one or two digits beyond. */
export const sudokuAlphabet = (puzzle: Sudoku): Alphabet => (puzzle.shape.size <= LARGEST_DIGIT ? 'digit' : 'number');

/** The cells the player fills, with the value each must hold; a printed given is never checked. */
export function sudokuExpected(puzzle: Sudoku): Map<number, string> {
  const expected = new Map<number, string>();
  puzzle.givens.forEach((value, i) => {
    if (value === 0) expected.set(i, String(puzzle.solution[i]));
  });
  return expected;
}

export interface SudokuCheck extends CheckResult {
  readonly reads: readonly CellRead[];
}

/**
 * «Check»: reads the player's entries from the page's strokes, in the page's pixels, and names the
 * wrong, right, empty and unread cells. It reads and compares only; it never writes to the note.
 */
export async function checkSudoku<E>(
  puzzle: Sudoku,
  layout: PageLayout,
  strokes: readonly InkStroke<E>[],
  recognize: Recognize<E>,
): Promise<SudokuCheck> {
  const expected = sudokuExpected(puzzle);
  const alphabet = sudokuAlphabet(puzzle);
  const reads = await readCells(layout.grid, strokes, [...expected.keys()], recognize, alphabet);
  return { ...checkCells(expected, reads, alphabet), reads };
}
