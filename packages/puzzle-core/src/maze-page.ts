/**
 * The maze page and its check (#386): a maze drawn with the shared page renderer (#379) and the
 * player's drawn path read with the shared check engine (#382). Pure geometry: no recognition, no
 * device call. The page never carries the answer; `mazeSolutionLine` gives the route for the plugin's
 * own view to overlay.
 */
import { type Maze } from './maze';
import { puzzleCode } from './code';
import { densePoints, pathCells, innerCellAt, type InkStroke } from './check';
import { copyRaster, drawInk, drawPolyline, drawRings, VIEW_ANSWER_PX } from './page/view';
import {
  createPage,
  drawFooter,
  fitCellMm,
  layoutPage,
  strokeLine,
  fillRect,
  LINE_PX,
  type CellPreset,
  type Grid,
  type Hand,
  type Orientation,
  type PageLayout,
  type Raster,
} from './page';

export const MAZE_WALL_PX = 4;
/** A path point this near a ring or a spoke is in no cell, as for a rectangle (`PATH_MARGIN`). */
const CIRCLE_MARGIN = 0.2;
/** An arc is drawn in chords about this share of a cell long. */
const ARC_CHORD = 0.2;
/** The middle of a cell or a ring, as a share of its size. */
const MIDDLE = 0.5;
const PATH_STEP = 0.1;
const FULL_TURN = 2 * Math.PI;
const FOOTER_RULE = 'Draw a line from the start to the end without crossing a wall.';
const GAME_NAME = 'Maze';

/** The fitted page layout of a maze: a circle needs a square of two cells per ring. */
export function mazeLayout(maze: Maze, orientation: Orientation, hand: Hand, cellMm?: CellPreset): PageLayout {
  const columns = maze.size.shape === 'rectangle' ? maze.size.width : 2 * maze.size.rings;
  const rows = maze.size.shape === 'rectangle' ? maze.size.height : 2 * maze.size.rings;
  const base = { orientation, hand, lattice: 'square', columns, rows } as const;
  return layoutPage({ ...base, cellMm: cellMm ?? fitCellMm(base) });
}

/** First cell index of each ring of a circular maze. */
function ringStarts(ringCells: readonly number[]): number[] {
  const starts: number[] = [];
  let total = 0;
  for (const count of ringCells) {
    starts.push(total);
    total += count;
  }
  return starts;
}

const pairKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

function closedPairs(maze: Maze): Set<string> {
  const closed = new Set<string>();
  maze.walls.forEach(([a, b], i) => {
    if (!maze.open[i]) closed.add(pairKey(a, b));
  });
  return closed;
}

function wall(raster: Raster, x0: number, y0: number, x1: number, y1: number, width: number): void {
  if (y0 === y1) fillRect(raster, Math.min(x0, x1) - width / 2, y0 - width / 2, Math.abs(x1 - x0) + width, width, 'ink');
  else fillRect(raster, x0 - width / 2, Math.min(y0, y1) - width / 2, width, Math.abs(y1 - y0) + width, 'ink');
}

function drawRectangle(raster: Raster, maze: Maze, grid: Grid): void {
  if (maze.size.shape !== 'rectangle') return;
  const { width, height } = maze.size;
  const { x, y, cell } = grid;
  const w = MAZE_WALL_PX;
  const closed = closedPairs(maze);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const index = r * width + c;
      if (c + 1 < width && closed.has(pairKey(index, index + 1))) wall(raster, x + (c + 1) * cell, y + r * cell, x + (c + 1) * cell, y + (r + 1) * cell, w);
      if (r + 1 < height && closed.has(pairKey(index, index + width))) wall(raster, x + c * cell, y + (r + 1) * cell, x + (c + 1) * cell, y + (r + 1) * cell, w);
    }
  }
  const right = x + width * cell;
  const bottom = y + height * cell;
  const f = LINE_PX.frame;
  // The entrance is the top edge of the start cell, the exit the bottom edge of the end cell.
  wall(raster, x + cell, y, right, y, f);
  wall(raster, x, y, x, bottom, f);
  wall(raster, right, y, right, bottom, f);
  wall(raster, x, bottom, right - cell, bottom, f);
}

const centreOf = (grid: Grid): [number, number] => [grid.x + (grid.columns * grid.cell) / 2, grid.y + (grid.rows * grid.cell) / 2];

function arc(raster: Raster, cx: number, cy: number, radius: number, from: number, to: number, cell: number, width: number): void {
  const steps = Math.max(1, Math.ceil((radius * (to - from)) / (cell * ARC_CHORD)));
  for (let i = 0; i < steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const b = from + ((to - from) * (i + 1)) / steps;
    strokeLine(raster, cx + radius * Math.cos(a), cy + radius * Math.sin(a), cx + radius * Math.cos(b), cy + radius * Math.sin(b), width, 'ink');
  }
}

function drawCircle(raster: Raster, maze: Maze, grid: Grid): void {
  if (maze.size.shape !== 'circle') return;
  const { rings } = maze.size;
  const { cell } = grid;
  const [cx, cy] = centreOf(grid);
  const starts = ringStarts(maze.ringCells);
  const closed = closedPairs(maze);
  const w = MAZE_WALL_PX;
  for (let ring = 1; ring < rings; ring++) {
    const count = maze.ringCells[ring];
    for (let k = 0; k < count; k++) {
      const cellIndex = starts[ring] + k;
      const a0 = (k / count) * FULL_TURN;
      const a1 = ((k + 1) / count) * FULL_TURN;
      const inner = ring === 1 ? 0 : starts[ring - 1] + Math.floor((k * maze.ringCells[ring - 1]) / count);
      if (closed.has(pairKey(inner, cellIndex))) arc(raster, cx, cy, ring * cell, a0, a1, cell, w);
      if (closed.has(pairKey(cellIndex, starts[ring] + ((k + 1) % count)))) {
        strokeLine(raster, cx + ring * cell * Math.cos(a1), cy + ring * cell * Math.sin(a1), cx + (ring + 1) * cell * Math.cos(a1), cy + (ring + 1) * cell * Math.sin(a1), w, 'ink');
      }
    }
  }
  // The outer frame, open at the exit cell; the centre is the start.
  const count = maze.ringCells[rings - 1];
  const exit = maze.end - starts[rings - 1];
  const gapFrom = (exit / count) * FULL_TURN;
  const gapTo = ((exit + 1) / count) * FULL_TURN;
  arc(raster, cx, cy, rings * cell, gapTo, gapFrom + FULL_TURN, cell, LINE_PX.frame);
}

/** The maze page: its walls and a footer, as a raster in the Manta's greys. */
export function drawMazePage(maze: Maze, layout: PageLayout, difficultyLabel: string = maze.id.difficulty): Raster {
  const raster = createPage(layout);
  if (maze.size.shape === 'rectangle') drawRectangle(raster, maze, layout.grid);
  else drawCircle(raster, maze, layout.grid);
  drawFooter(raster, layout, { game: GAME_NAME, difficulty: difficultyLabel, code: puzzleCode(maze.id), rule: FOOTER_RULE });
  return raster;
}

/** The centre of a cell on the page. */
export function mazeCellCentre(maze: Maze, grid: Grid, cell: number): [number, number] {
  if (maze.size.shape === 'rectangle') {
    const { width } = maze.size;
    return [grid.x + ((cell % width) + MIDDLE) * grid.cell, grid.y + (Math.floor(cell / width) + MIDDLE) * grid.cell];
  }
  const [cx, cy] = centreOf(grid);
  const starts = ringStarts(maze.ringCells);
  const ring = starts.filter(start => start <= cell).length - 1;
  if (ring === 0) return [cx, cy];
  const angle = ((cell - starts[ring] + MIDDLE) / maze.ringCells[ring]) * FULL_TURN;
  const radius = (ring + MIDDLE) * grid.cell;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/** The solution as a line of page points, for the plugin's view to draw; never written to the page. */
export function mazeSolutionLine(maze: Maze, layout: PageLayout): [number, number][] {
  return maze.solution.map(cell => mazeCellCentre(maze, layout.grid, cell));
}

/** The cell a point is in, null near a wall line or off the maze. */
export function mazeCellAt(maze: Maze, grid: Grid, x: number, y: number): number | null {
  if (maze.size.shape === 'rectangle') return innerCellAt(grid, x, y);
  const [cx, cy] = centreOf(grid);
  const radius = Math.hypot(x - cx, y - cy) / grid.cell;
  const ring = Math.floor(radius);
  if (ring >= maze.size.rings) return null;
  const across = radius - ring;
  if (ring > 0 && across < CIRCLE_MARGIN) return null;
  if (across > 1 - CIRCLE_MARGIN) return null;
  if (ring === 0) return 0;
  const count = maze.ringCells[ring];
  const turn = (((Math.atan2(y - cy, x - cx) % FULL_TURN) + FULL_TURN) % FULL_TURN) / FULL_TURN;
  const along = turn * count - Math.floor(turn * count);
  if (along < CIRCLE_MARGIN / (ring + MIDDLE) || along > 1 - CIRCLE_MARGIN / (ring + MIDDLE)) return null;
  return ringStarts(maze.ringCells)[ring] + Math.min(count - 1, Math.floor(turn * count));
}

export interface MazeCheck {
  /** Cells the drawn path visits, in order, each stroke's repeats dropped. */
  visited: number[];
  /** Visited cells that are not on the solution: the wrong entries. */
  wrong: number[];
  /** Neighbouring cells the path went between through a wall, smaller index first. */
  crossings: [number, number][];
  /** True when the path covers the start, the end and every cell between. */
  solved: boolean;
}

/** Reads the player's strokes as a path and names its wrong cells and wall crossings. */
export function checkMaze(maze: Maze, layout: PageLayout, strokes: readonly InkStroke[]): MazeCheck {
  const { grid } = layout;
  const onSolution = new Set(maze.solution);
  const closed = closedPairs(maze);
  const neighbours = new Set(maze.walls.map(([a, b]) => pairKey(a, b)));
  const visited = new Set<number>();
  const wrong = new Set<number>();
  const crossings = new Map<string, [number, number]>();
  const order: number[] = [];
  for (const stroke of strokes) {
    const cells = pathCells(densePoints(stroke.points, grid.cell * PATH_STEP), (x, y) => mazeCellAt(maze, grid, x, y));
    cells.forEach((cell, i) => {
      if (!visited.has(cell)) order.push(cell);
      visited.add(cell);
      if (!onSolution.has(cell)) wrong.add(cell);
      const previous = cells[i - 1];
      if (i > 0 && neighbours.has(pairKey(previous, cell)) && closed.has(pairKey(previous, cell))) {
        crossings.set(pairKey(previous, cell), previous < cell ? [previous, cell] : [cell, previous]);
      }
    });
  }
  return {
    visited: order,
    wrong: [...wrong].sort((a, b) => a - b),
    crossings: [...crossings.values()],
    solved: maze.solution.every(cell => visited.has(cell)) && wrong.size === 0 && crossings.size === 0,
  };
}

/** Where «Check» rings a maze's mistakes: each wrong cell, and the wall between the two cells of each crossing. */
export function mazeMarks(maze: Maze, grid: Grid, check: MazeCheck): [number, number][] {
  const centre = (cell: number) => mazeCellCentre(maze, grid, cell);
  const walls = check.crossings.map(([a, b]): [number, number] => {
    const [ax, ay] = centre(a);
    const [bx, by] = centre(b);
    return [(ax + bx) / 2, (ay + by) / 2];
  });
  return [...check.wrong.map(centre), ...walls];
}

/** The ring around a mark, as a share of a cell: most of it, so it never hides the next cell's ink. */
const MARK_SHARE = 0.4;
export const mazeMarkRadius = (grid: Grid): number => grid.cell * MARK_SHARE;

/** The page with the player's ink and mistakes ringed, for the plugin's view only. */
export function drawMazeCheck(maze: Maze, layout: PageLayout, page: Raster, strokes: readonly InkStroke[], check: MazeCheck): Raster {
  const marked = copyRaster(page);
  drawInk(marked, strokes);
  drawRings(marked, mazeMarks(maze, layout.grid, check), mazeMarkRadius(layout.grid));
  return marked;
}

/** The page with the route drawn, for the plugin's view only: the note never gets it. */
export function drawMazeAnswer(maze: Maze, layout: PageLayout, page: Raster): Raster {
  const answer = copyRaster(page);
  drawPolyline(answer, mazeSolutionLine(maze, layout), VIEW_ANSWER_PX);
  return answer;
}
