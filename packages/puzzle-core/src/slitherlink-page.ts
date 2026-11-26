/**
 * A slitherlink's page and its «Check» (#391): the dots and the counts drawn with the shared
 * renderer, and the loop read back from the ink with the shared check, never written to the note.
 */
import { inkedEdges, type InkStroke } from './check';
import { puzzleCode } from './code';
import {
  createPage,
  drawCellText,
  drawDotLattice,
  drawFooter,
  fitCellMm,
  layoutPage,
  type CellPreset,
  type Grid,
  type Hand,
  type Orientation,
  type PageLayout,
  type Raster,
} from './page';
import { slitherlinkEdgeKeys, type Slitherlink } from './slitherlink';

export interface SlitherlinkPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** The cell preset; the largest that fits when absent. */
  cellMm?: CellPreset;
  /** The footer's words, from the plugin's copy: the game's name, the band's name and the one-line rule. */
  text: { game: string; difficulty: string; rule: string };
}

/** The puzzle's page: a dot on every lattice point, each shown count in its cell, and the footer. */
export function drawSlitherlinkPage(puzzle: Slitherlink, options: SlitherlinkPageOptions): { layout: PageLayout; raster: Raster } {
  const spec = { orientation: options.orientation, hand: options.hand, lattice: 'square' as const, columns: puzzle.width, rows: puzzle.height };
  const layout = layoutPage({ ...spec, cellMm: options.cellMm ?? fitCellMm(spec) });
  const raster = createPage(layout);
  drawDotLattice(raster, layout.grid);
  puzzle.clues.forEach((clue, i) => {
    if (clue !== null) drawCellText(raster, layout.grid, i % puzzle.width, Math.floor(i / puzzle.width), String(clue), 'given');
  });
  drawFooter(raster, layout, { ...options.text, code: puzzleCode(puzzle.id) });
  return { layout, raster };
}

export interface SlitherlinkCheck {
  /** Edges the ink draws that the loop does not take: the ones «Check» marks. */
  wrong: string[];
  /** Loop edges the ink does not draw yet; not wrong, only left to do. */
  missing: string[];
  /** True when the ink draws the loop and nothing else. */
  solved: boolean;
}

/** Compares the edges the player drew on the page's grid with the loop, by `inkedEdges` keys. */
export function checkSlitherlink(puzzle: Slitherlink, grid: Grid, strokes: readonly InkStroke[]): SlitherlinkCheck {
  if (grid.columns !== puzzle.width || grid.rows !== puzzle.height) {
    throw new Error(`the page's grid is ${grid.columns} x ${grid.rows}, the puzzle ${puzzle.width} x ${puzzle.height}`);
  }
  const drawn = inkedEdges(grid, strokes);
  const keys = slitherlinkEdgeKeys(puzzle.width, puzzle.height);
  const wrong = keys.filter((key, i) => !puzzle.solution[i] && drawn.has(key));
  const missing = keys.filter((key, i) => puzzle.solution[i] && !drawn.has(key));
  return { wrong, missing, solved: wrong.length === 0 && missing.length === 0 };
}
