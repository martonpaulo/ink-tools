/**
 * A Star Battle page and its «Check» (#392): the grid with its regions drawn by the shared
 * renderer, and the player's ink read by the shared check engine. The footer's copy is the
 * caller's, so the plugin keeps every visible string.
 */
import { classifyMark, strokesByCell, type InkStroke } from './check/cells';
import { type CheckResult } from './check/read';
import { drawRegions, drawSquareLattice, type Grid } from './page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type FooterText, type PageLayout } from './page/layout';
import { type CellPreset, type Hand, type Orientation } from './page/look';
import { type Raster } from './page/raster';
import { type StarBattle } from './star-battle';

export interface StarBattlePageOptions {
  orientation: Orientation;
  hand: Hand;
  /** A cell preset; without one, the largest that fits the page. */
  cellMm?: CellPreset;
}

/** Where the puzzle's grid and footer go on the page. */
export function layoutStarBattle(puzzle: StarBattle, options: StarBattlePageOptions): PageLayout {
  const spec = { orientation: options.orientation, hand: options.hand, lattice: 'square' as const, columns: puzzle.side, rows: puzzle.side };
  return layoutPage({ ...spec, cellMm: options.cellMm ?? fitCellMm(spec) });
}

/** The page: grid lines, the regions' thick borders, and the footer. No star is ever drawn on it. */
export function drawStarBattlePage(puzzle: StarBattle, layout: PageLayout, footer: FooterText): Raster {
  const raster = createPage(layout);
  drawSquareLattice(raster, layout.grid);
  drawRegions(raster, layout.grid, (column, row) => puzzle.regions[row * puzzle.side + column]);
  drawFooter(raster, layout, footer);
  return raster;
}

/**
 * The wrong cells of a hand-solved page. A dot marks a cell the player ruled out; any larger mark
 * is a star, since a drawn star's slanted strokes read as a cross or a shade. A star off the
 * solution and a dot on a solution cell are `wrong`; a solution cell with no mark is `empty`; a star
 * on a solution cell is `right`. Nothing is recognised, so nothing is `unread`.
 */
export function checkStarBattle<E>(puzzle: StarBattle, grid: Grid, strokes: readonly InkStroke<E>[]): CheckResult {
  if (grid.lattice !== 'square' || grid.columns !== puzzle.side || grid.rows !== puzzle.side) {
    throw new Error(`a ${puzzle.side} x ${puzzle.side} star battle is checked on its own grid, not a ${grid.columns} x ${grid.rows} ${grid.lattice} one`);
  }
  const byCell = strokesByCell(grid, strokes);
  const result: CheckResult = { wrong: [], right: [], empty: [], unread: [] };
  puzzle.solution.forEach((star, index) => {
    const mark = classifyMark(grid, index, byCell.get(index) ?? []);
    const placed = mark !== 'empty' && mark !== 'dot';
    if (star) (placed ? result.right : mark === 'dot' ? result.wrong : result.empty).push(index);
    else if (placed) result.wrong.push(index);
  });
  return result;
}
