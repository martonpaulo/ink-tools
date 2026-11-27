/**
 * The kakuro page and its «Check» (#389), over the shared renderer and ink check: the blocks
 * shaded, each clue block split by a diagonal with its sums, and the player's digits read from the
 * ink and compared with the solution. `drawKakuroPage` adds the footer; the page carries no answer.
 */
import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { DIFFICULTY_LABELS, puzzleCode } from './code';
import { type Kakuro } from './kakuro';
import { drawSplitClue, drawSquareLattice, shadeCells, type Cell, type Grid } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type PageLayout, type PageSpec } from './page/layout';
import { type CellPreset, type Hand, type Orientation } from './page/look';
import { type Raster } from './page/raster';

export interface KakuroPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** The cell preset; the largest that fits when absent. */
  cellMm?: CellPreset;
}

/** The footer's game name and one-line rule. */
export const KAKURO_FOOTER = { game: 'Kakuro', rule: 'Put 1 to 9 once in each run; each run adds up to its sum.' } as const;

/** The page a kakuro needs: a square grid of its side, no outside clue, no side panel. */
export function kakuroPageSpec(puzzle: Kakuro, options: KakuroPageOptions): PageSpec {
  const shape = { orientation: options.orientation, hand: options.hand, lattice: 'square', columns: puzzle.size, rows: puzzle.size } as const;
  return { ...shape, cellMm: options.cellMm ?? fitCellMm(shape) };
}

/** Draws the grid on a page laid out from `kakuroPageSpec`: blocks, lattice and the split clues. */
export function drawKakuro(raster: Raster, grid: Grid, puzzle: Kakuro): void {
  if (grid.columns !== puzzle.size || grid.rows !== puzzle.size) {
    throw new Error(`a ${puzzle.size} x ${puzzle.size} kakuro needs a grid of that size, not ${grid.columns} x ${grid.rows}`);
  }
  const cellOf = (index: number): Cell => [index % puzzle.size, Math.floor(index / puzzle.size)];
  shadeCells(raster, grid, puzzle.blocks.flatMap((block, index) => (block ? [cellOf(index)] : [])));
  drawSquareLattice(raster, grid);
  const sums = new Map<number, { across?: string; down?: string }>();
  for (const run of puzzle.runs) sums.set(run.clue, { ...sums.get(run.clue), [run.direction]: String(run.sum) });
  for (const [index, { across, down }] of sums) drawSplitClue(raster, grid, ...cellOf(index), across, down);
}

/** The puzzle's page with its footer: its layout, for «Check», and its raster, for `encodePng`. */
export function drawKakuroPage(puzzle: Kakuro, options: KakuroPageOptions): { layout: PageLayout; raster: Raster } {
  const layout = layoutPage(kakuroPageSpec(puzzle, options));
  const raster = createPage(layout);
  drawKakuro(raster, layout.grid, puzzle);
  drawFooter(raster, layout, { ...KAKURO_FOOTER, difficulty: DIFFICULTY_LABELS[puzzle.id.difficulty], code: puzzleCode(puzzle.id) });
  return { layout, raster };
}

/** The digit each white cell must hold, by cell index: what «Check» compares and «Show solution» shows. */
export function kakuroAnswers(puzzle: Kakuro): Map<number, string> {
  return new Map(puzzle.blocks.flatMap((block, index) => (block ? [] : [[index, String(puzzle.solution[index])] as const])));
}

/**
 * «Check»: reads the digits the player wrote in the white cells, one recogniser call per row, and
 * names the wrong cells; an empty cell is empty and an unreadable one unread, never wrong.
 */
export async function checkKakuro<E>(grid: Grid, puzzle: Kakuro, strokes: readonly InkStroke<E>[], recognize: Recognize<E>): Promise<CheckResult> {
  const answers = kakuroAnswers(puzzle);
  const reads = await readCells(grid, strokes, [...answers.keys()], recognize, 'digit');
  return checkCells(answers, reads, 'digit');
}
