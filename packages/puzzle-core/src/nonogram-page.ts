/**
 * A nonogram on a Puzzles page (#384): its page drawn with the shared renderer, and its «Check»
 * rule over the shared ink check. The picture and its clues come from `generateNonogram`.
 *
 * The player shades a filled cell and may mark an empty one with a dot or a cross, as printed
 * nonograms ask. «Check» names a wrong cell from those marks alone: no recognition is called.
 */
import { classifyMark, marksByCell, type InkStroke } from './check/cells';
import type { CheckResult } from './check/read';
import { drawOutsideClues, drawRegions, drawSquareLattice } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type FooterText, type PageLayout, type PageSpec } from './page/layout';
import type { CellPreset, Hand, Orientation } from './page/look';
import type { Raster } from './page/raster';
import { puzzleCode } from './code';
import type { Nonogram } from './nonogram';

export interface NonogramPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** A cell preset; absent, the largest at which the grid and its clues fit. */
  cellMm?: CellPreset;
}

/** A heavier line every this many cells, so a long run is counted at a glance, as printed nonograms do (#384). */
export const NONOGRAM_GROUP = 5;

/** A line's clue as printed: its runs, or 0 for a line with no filled cell, so no clue looks missing (#384). */
const clueText = (runs: readonly number[]): string[] => (runs.length > 0 ? runs.map(String) : ['0']);

/** The deepest clue list of a side: the most runs any one line has. */
const deepest = (lists: readonly (readonly number[])[]): number => Math.max(0, ...lists.map(list => list.length));

/** Where the puzzle's grid and clues go; throws `PageFitError` when they do not fit the page. */
export function layoutNonogramPage(puzzle: Nonogram, options: NonogramPageOptions): PageLayout {
  const spec: Omit<PageSpec, 'cellMm'> = {
    orientation: options.orientation,
    hand: options.hand,
    lattice: 'square',
    columns: puzzle.width,
    rows: puzzle.height,
    clues: { top: deepest(puzzle.columns), left: deepest(puzzle.rows) },
  };
  return layoutPage({ ...spec, cellMm: options.cellMm ?? fitCellMm(spec) });
}

/**
 * The page: the empty grid with a heavier line every five cells, the column clues above it, the row
 * clues on its left and the footer.
 * The caller gives the footer's words, so the product copy stays with the view; the code is the
 * puzzle's own. The answer is never drawn.
 */
export function drawNonogramPage(puzzle: Nonogram, layout: PageLayout, footer: Omit<FooterText, 'code'>): Raster {
  const raster = createPage(layout);
  drawSquareLattice(raster, layout.grid);
  drawRegions(raster, layout.grid, (column, row) => Math.floor(column / NONOGRAM_GROUP) * puzzle.height + Math.floor(row / NONOGRAM_GROUP));
  drawOutsideClues(raster, layout.grid, 'top', puzzle.columns.map(clueText), layout.clueGap);
  drawOutsideClues(raster, layout.grid, 'left', puzzle.rows.map(clueText), layout.clueGap);
  drawFooter(raster, layout, { ...footer, code: puzzleCode(puzzle.id) });
  return raster;
}

/**
 * Compares the player's marks with the picture, cell by cell: a shade is filled, a dot or a cross
 * is empty, no ink is not yet answered. A shaded empty cell or a marked filled cell is wrong. Any
 * other ink (a scribble, a stray letter) is `unread`, never wrong, so «Check» raises no false alarm.
 */
export function checkNonogram(puzzle: Nonogram, layout: PageLayout, strokes: readonly InkStroke[]): CheckResult {
  const { grid } = layout;
  if (grid.columns !== puzzle.width || grid.rows !== puzzle.height) {
    throw new Error(`the page's grid is ${grid.columns} x ${grid.rows}, the nonogram ${puzzle.width} x ${puzzle.height}`);
  }
  const byCell = marksByCell(grid, strokes);
  const result: CheckResult = { wrong: [], right: [], empty: [], unread: [] };
  puzzle.solution.forEach((filled, index) => {
    const mark = classifyMark(grid, index, byCell.get(index) ?? []);
    if (mark === 'empty') result.empty.push(index);
    else if (mark === 'other') result.unread.push({ index, reason: 'neither a shade, a dot nor a cross' });
    else ((mark === 'shade') === filled ? result.right : result.wrong).push(index);
  });
  return result;
}
