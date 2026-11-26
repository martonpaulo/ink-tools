/**
 * A Bridges page and its «Check» (#396): the islands drawn with the shared renderer, and the
 * player's bridges read from the ink with the shared line check, no recognition.
 */
import { bridgesLinks, type Bridges } from './bridges';
import { strokesAlong, type InkStroke } from './check';
import { drawCellText, drawIcon, fitCellMm, type Grid, type Hand, type Orientation, type PageSpec, type Raster } from './page';

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

/** Link indexes of `bridgesLinks(puzzle.islands)`, by what the ink shows on each. */
export interface BridgesCheck {
  /** Bridges drawn with the wrong count, one or two where none or another count belongs. */
  readonly wrong: number[];
  readonly right: number[];
  /** No bridge drawn where the solution has one. */
  readonly empty: number[];
}

/**
 * Counts the strokes along each link between its two islands and compares them with the solution.
 * A link with no ink and no bridge in the solution is in no list.
 */
export function checkBridges(grid: Grid, puzzle: Bridges, strokes: readonly InkStroke[]): BridgesCheck {
  requireGrid(grid, puzzle);
  const result: BridgesCheck = { wrong: [], right: [], empty: [] };
  bridgesLinks(puzzle.islands).forEach((link, e) => {
    const [a, b] = [puzzle.islands[link.from], puzzle.islands[link.to]];
    const drawn = strokesAlong(grid, [a.column, a.row], [b.column, b.row], strokes);
    const want = puzzle.solution[e];
    if (drawn === 0) {
      if (want > 0) result.empty.push(e);
    } else (drawn === want ? result.right : result.wrong).push(e);
  });
  return result;
}
