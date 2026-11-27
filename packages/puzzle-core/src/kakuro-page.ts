/**
 * The kakuro page and its «Check» (#389), over the shared renderer and ink check: the blocks
 * shaded, each clue block split by a diagonal with its sums, and the player's digits read from the
 * ink and compared with the solution. The footer's copy is the plugin's, so it is not drawn here.
 */
import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { type Kakuro } from './kakuro';
import { drawSplitClue, drawSquareLattice, shadeCells, type Cell, type Grid } from './page/grid';
import { type PageSpec } from './page/layout';
import { type CellPreset, type Hand, type Orientation } from './page/look';
import { type Raster } from './page/raster';

export interface KakuroPageOptions {
  orientation: Orientation;
  hand: Hand;
  cellMm: CellPreset;
}

/** The page a kakuro needs: a square grid of its side, no outside clue, no side panel. */
export function kakuroPageSpec(puzzle: Kakuro, options: KakuroPageOptions): PageSpec {
  return { ...options, lattice: 'square', columns: puzzle.size, rows: puzzle.size };
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
