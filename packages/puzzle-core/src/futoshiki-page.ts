/**
 * A futoshiki's page and its «Check» (#390): the grid, its givens and its signs drawn with the
 * shared renderer, and the player's digits read with the shared ink check. The answer is never
 * drawn on the page; «Show solution» belongs to the plugin's view.
 */
import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { puzzleCode } from './code';
import { type Futoshiki } from './futoshiki';
import { drawCellText, drawEdgeSign, drawSquareLattice, type Grid } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type PageLayout } from './page/layout';
import { type CellPreset, type Hand, type Orientation } from './page/look';
import { type Raster } from './page/raster';

/** The page's copy: the game's name, its bands and its one-line rule. */
export const FUTOSHIKI_COPY = {
  game: 'Futoshiki',
  bands: { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' },
  rule: (size: number) => `Put 1 to ${size} once in each row and column; each sign points to the smaller digit.`,
} as const;

export interface FutoshikiPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** The cell preset; the largest that fits when absent. */
  cellMm?: CellPreset;
}

/** Draws the puzzle's page: the lattice, the givens, every sign and the footer. */
export function drawFutoshikiPage(puzzle: Futoshiki, options: FutoshikiPageOptions): { raster: Raster; layout: PageLayout } {
  const n = puzzle.size;
  const shape = { orientation: options.orientation, hand: options.hand, lattice: 'square', columns: n, rows: n } as const;
  const layout = layoutPage({ ...shape, cellMm: options.cellMm ?? fitCellMm(shape) });
  const raster = createPage(layout);
  const { grid } = layout;
  drawSquareLattice(raster, grid);
  puzzle.givens.forEach((v, i) => v > 0 && drawCellText(raster, grid, i % n, Math.floor(i / n), String(v), 'given'));
  for (const { less, greater } of puzzle.signs) {
    const first = Math.min(less, greater);
    const toward = Math.max(less, greater) - first === 1 ? 'right' : 'down';
    drawEdgeSign(raster, grid, first % n, Math.floor(first / n), toward, less === first ? 'first' : 'second');
  }
  drawFooter(raster, layout, {
    game: FUTOSHIKI_COPY.game,
    difficulty: FUTOSHIKI_COPY.bands[puzzle.id.difficulty],
    code: puzzleCode(puzzle.id),
    rule: FUTOSHIKI_COPY.rule(n),
  });
  return { raster, layout };
}

/**
 * «Check»: reads the digit in each cell the player fills, through the host's recogniser, and
 * names the wrong cells against the solution. A given is never read; an unread cell is never wrong.
 */
export async function checkFutoshiki<E>(puzzle: Futoshiki, grid: Grid, strokes: readonly InkStroke<E>[], recognize: Recognize<E>): Promise<CheckResult> {
  if (grid.columns !== puzzle.size || grid.rows !== puzzle.size) {
    throw new Error(`a ${puzzle.size} x ${puzzle.size} futoshiki is checked on its own grid, not a ${grid.columns} x ${grid.rows} one`);
  }
  const open = puzzle.givens.flatMap((v, i) => (v === 0 ? [i] : []));
  const reads = await readCells(grid, strokes, open, recognize, 'digit');
  return checkCells(new Map(open.map(i => [i, String(puzzle.solution[i])])), reads, 'digit');
}
