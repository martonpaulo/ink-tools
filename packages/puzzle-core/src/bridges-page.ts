/**
 * A Bridges page and its «Check» (#396): the islands drawn with the shared renderer, and the
 * player's bridges read from the ink with the shared line check, no recognition.
 */
import { bridgesLinks, type Bridges } from './bridges';
import { strokesAlong, type InkStroke } from './check';
import { DIFFICULTY_LABELS, puzzleCode } from './code';
import {
  createPage,
  drawCellText,
  drawFooter,
  drawIcon,
  fitCellMm,
  layoutPage,
  type Grid,
  type Hand,
  type LinkAnswer,
  type Orientation,
  type PageLayout,
  type PageSpec,
  type Raster,
} from './page';

/** The footer's game name and one-line rule. */
export const BRIDGES_FOOTER = {
  game: 'Bridges',
  rule: 'Join all islands by straight bridges, at most two per pair, none crossing; numbers count bridges.',
} as const;

/** The page of a puzzle: a square grid with no lines, at the largest cell preset that fits. */
export function bridgesPageSpec(puzzle: Bridges, orientation: Orientation, hand: Hand): PageSpec {
  const spec = { orientation, hand, lattice: 'square', columns: puzzle.width, rows: puzzle.height } as const;
  return { ...spec, cellMm: fitCellMm(spec) };
}

function requireGrid(grid: Grid, puzzle: Bridges): void {
  if (grid.lattice !== 'square' || grid.columns !== puzzle.width || grid.rows !== puzzle.height) {
    throw new Error(`a ${puzzle.width} x ${puzzle.height} Bridges grid needs a square grid of that size, not ${grid.columns} x ${grid.rows} ${grid.lattice}`);
  }
}

/** Each island as a ring with its number, and no grid lines, so the bridges stand out. */
export function drawBridges(raster: Raster, grid: Grid, puzzle: Bridges): void {
  requireGrid(grid, puzzle);
  for (const { column, row, clue } of puzzle.islands) {
    drawIcon(raster, grid, column, row, 'pearl-white');
    drawCellText(raster, grid, column, row, String(clue), 'given');
  }
}

/** The puzzle's page with its footer: its layout, for «Check», and its raster, for `encodePng`. */
export function drawBridgesPage(puzzle: Bridges, orientation: Orientation, hand: Hand): { layout: PageLayout; raster: Raster } {
  const layout = layoutPage(bridgesPageSpec(puzzle, orientation, hand));
  const raster = createPage(layout);
  drawBridges(raster, layout.grid, puzzle);
  drawFooter(raster, layout, { ...BRIDGES_FOOTER, difficulty: DIFFICULTY_LABELS[puzzle.id.difficulty], code: puzzleCode(puzzle.id) });
  return { layout, raster };
}

/** Each link of the solution with its bridges, by `bridgesLinks` index: what «Show solution» draws and «Check» rings. */
export function bridgesAnswers(puzzle: Bridges): LinkAnswer[] {
  return bridgesLinks(puzzle.islands).map((link, e) => {
    const [a, b] = [puzzle.islands[link.from], puzzle.islands[link.to]];
    return { from: [a.column, a.row], to: [b.column, b.row], count: puzzle.solution[e] };
  });
}

/** Link indexes of `bridgesLinks(puzzle.islands)`, by what the ink shows on each. */
export interface BridgesCheck {
  /** More bridges drawn than the solution has: one or two where none belongs, or two where one does. */
  readonly wrong: number[];
  readonly right: number[];
  /** Fewer bridges drawn than the solution has, none included: left to do, never wrong (#396). */
  readonly empty: number[];
}

/**
 * Counts the lines along each link between its two islands and compares them with the solution.
 * A link with no ink and no bridge in the solution is in no list.
 */
export function checkBridges(grid: Grid, puzzle: Bridges, strokes: readonly InkStroke[]): BridgesCheck {
  requireGrid(grid, puzzle);
  const result: BridgesCheck = { wrong: [], right: [], empty: [] };
  bridgesLinks(puzzle.islands).forEach((link, e) => {
    const [a, b] = [puzzle.islands[link.from], puzzle.islands[link.to]];
    const drawn = strokesAlong(grid, [a.column, a.row], [b.column, b.row], strokes);
    const want = puzzle.solution[e];
    if (drawn > want) result.wrong.push(e);
    else if (drawn < want) result.empty.push(e);
    else if (drawn > 0) result.right.push(e);
  });
  return result;
}
