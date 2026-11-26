/**
 * Perfect mazes (#380): exactly one path between any two cells, so the solution is unique by
 * construction. Two shapes, a rectangle and a circle (rings around a centre cell), share one graph
 * model, and the band sets the carving algorithm:
 *
 * - `easy`: depth-first (the recursive backtracker): long corridors, few side branches;
 * - `medium`: growing tree, half newest cell and half a random one;
 * - `hard`: Wilson's uniform spanning tree: many short dead ends and choices along the way.
 *
 * The rating counts the junctions on the solution path, the places a solver must choose.
 */

import { type Difficulty, type PuzzleId } from './code';
import { createRandom, type Random } from './random';

export type MazeSize = { shape: 'rectangle'; width: number; height: number } | { shape: 'circle'; rings: number };

export interface Maze {
  id: PuzzleId;
  size: MazeSize;
  /**
   * Cells per ring for a circle, the centre first (ring 0 has one cell); empty for a rectangle,
   * whose cell index is row * width + column.
   */
  ringCells: number[];
  /** Every pair of neighbouring cells, smaller index first. */
  walls: [number, number][];
  /** For each pair in `walls`, true when it is open (a passage). */
  open: boolean[];
  start: number;
  end: number;
  /** The one path from start to end, cell by cell. */
  solution: number[];
  /** Cells on the solution path with three or more passages. */
  junctions: number;
}

export const MAZE_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const MAZE_LIMITS = { minSide: 4, maxSide: 80, minRings: 3, maxRings: 40 } as const;
const RING_ONE_CELLS = 6;
/** How often each band's growing tree takes its newest cell, in percent. */
const NEWEST_PERCENT = { easy: 100, medium: 50 } as const;
/** A cell with this many passages or more is a junction: a choice for the solver. */
const JUNCTION_PASSAGES = 3;

interface Graph {
  cells: number;
  ringCells: number[];
  walls: [number, number][];
  neighbours: number[][];
}

function rectangle(width: number, height: number): Graph {
  const walls: [number, number][] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell = r * width + c;
      if (c + 1 < width) walls.push([cell, cell + 1]);
      if (r + 1 < height) walls.push([cell, cell + width]);
    }
  }
  return withNeighbours(width * height, [], walls);
}

/**
 * Ring i (i at least 1) has 6 * 2^floor(log2 i) cells, so each ring has the same or twice the cells
 * of the one inside it and cells stay about as wide as they are deep. Integer arithmetic only.
 */
export function ringCellCounts(rings: number): number[] {
  const counts = [1];
  let power = 1;
  for (let i = 1; i < rings; i++) {
    if (power * 2 <= i) power *= 2;
    counts.push(RING_ONE_CELLS * power);
  }
  return counts;
}

function circle(rings: number): Graph {
  const ringCells = ringCellCounts(rings);
  const first: number[] = [];
  let total = 0;
  for (const count of ringCells) {
    first.push(total);
    total += count;
  }
  const walls: [number, number][] = [];
  for (let ring = 1; ring < rings; ring++) {
    const count = ringCells[ring];
    for (let k = 0; k < count; k++) {
      const cell = first[ring] + k;
      walls.push([cell, first[ring] + ((k + 1) % count)].sort((a, b) => a - b) as [number, number]);
      // The inward neighbour: the inner ring has the same or half the cells.
      const inner = ring === 1 ? 0 : first[ring - 1] + Math.floor((k * ringCells[ring - 1]) / count);
      walls.push([inner, cell]);
    }
  }
  return withNeighbours(total, ringCells, walls);
}

function withNeighbours(cells: number, ringCells: number[], walls: [number, number][]): Graph {
  const neighbours: number[][] = Array.from({ length: cells }, () => []);
  for (const [a, b] of walls) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  return { cells, ringCells, walls, neighbours };
}

/** The largest cell count (80 x 80; 40 rings hold fewer), so a pair of cells packs into one number. */
const EDGE_KEY_BASE = MAZE_LIMITS.maxSide * MAZE_LIMITS.maxSide;
const edgeKey = (a: number, b: number): number => (a < b ? a * EDGE_KEY_BASE + b : b * EDGE_KEY_BASE + a);

/** Growing tree: `newestPercent` picks the newest active cell, the rest a random one. */
function growingTree(graph: Graph, random: Random, newestPercent: number): Set<number> {
  const visited = new Array<boolean>(graph.cells).fill(false);
  const passages = new Set<number>();
  const startCell = random.int(graph.cells);
  const active = [startCell];
  visited[startCell] = true;
  while (active.length) {
    const index = random.chance(newestPercent) ? active.length - 1 : random.int(active.length);
    const cell = active[index];
    const fresh = graph.neighbours[cell].filter(n => !visited[n]);
    if (!fresh.length) {
      active.splice(index, 1);
      continue;
    }
    const next = random.pick(fresh);
    visited[next] = true;
    passages.add(edgeKey(cell, next));
    active.push(next);
  }
  return passages;
}

/** Wilson's algorithm: loop-erased random walks, a uniform pick among all spanning trees. */
function wilson(graph: Graph, random: Random): Set<number> {
  const inTree = new Array<boolean>(graph.cells).fill(false);
  const passages = new Set<number>();
  const nextOf = new Int32Array(graph.cells);
  inTree[random.int(graph.cells)] = true;
  for (let start = 0; start < graph.cells; start++) {
    if (inTree[start]) continue;
    // Walk until the tree is hit; remembering only the last exit of each cell erases the loops.
    let cell = start;
    while (!inTree[cell]) {
      const next = random.pick(graph.neighbours[cell]);
      nextOf[cell] = next;
      cell = next;
    }
    cell = start;
    while (!inTree[cell]) {
      inTree[cell] = true;
      passages.add(edgeKey(cell, nextOf[cell]));
      cell = nextOf[cell];
    }
  }
  return passages;
}

function pathBetween(graph: Graph, passages: Set<number>, start: number, end: number): number[] {
  const from = new Int32Array(graph.cells).fill(-1);
  from[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (cell === end) break;
    for (const n of graph.neighbours[cell]) {
      if (from[n] < 0 && passages.has(edgeKey(cell, n))) {
        from[n] = cell;
        queue.push(n);
      }
    }
  }
  const path = [end];
  while (path[path.length - 1] !== start) path.push(from[path[path.length - 1]]);
  return path.reverse();
}

function checkSize(size: MazeSize): void {
  const sides = size.shape === 'rectangle' ? [size.width, size.height] : [];
  for (const side of sides) {
    if (!Number.isInteger(side) || side < MAZE_LIMITS.minSide || side > MAZE_LIMITS.maxSide) {
      throw new RangeError(`a maze side is ${MAZE_LIMITS.minSide} to ${MAZE_LIMITS.maxSide} cells, not ${side}`);
    }
  }
  if (size.shape === 'circle' && (!Number.isInteger(size.rings) || size.rings < MAZE_LIMITS.minRings || size.rings > MAZE_LIMITS.maxRings)) {
    throw new RangeError(`a circular maze has ${MAZE_LIMITS.minRings} to ${MAZE_LIMITS.maxRings} rings, not ${size.rings}`);
  }
}

export const mazeSizeToken = (size: MazeSize): string =>
  size.shape === 'rectangle' ? `${size.width}X${size.height}` : `C${size.rings}`;

/**
 * A perfect maze of the given size and band from the seed. A rectangle runs from the top-left cell
 * to the bottom-right one; a circle from the centre to a seeded cell of the outer ring.
 */
export function generateMaze(seed: string, size: MazeSize, difficulty: Difficulty): Maze {
  checkSize(size);
  if (!MAZE_BANDS.includes(difficulty)) throw new RangeError(`a maze offers ${MAZE_BANDS.join(', ')}, not ${difficulty}`);
  const graph = size.shape === 'rectangle' ? rectangle(size.width, size.height) : circle(size.rings);
  const random = createRandom(seed);
  const passages =
    difficulty === 'easy' || difficulty === 'medium' ? growingTree(graph, random, NEWEST_PERCENT[difficulty]) : wilson(graph, random);
  const start = 0;
  const end =
    size.shape === 'rectangle' ? graph.cells - 1 : graph.cells - graph.ringCells[graph.ringCells.length - 1] + random.int(graph.ringCells[graph.ringCells.length - 1]);
  const solution = pathBetween(graph, passages, start, end);
  const degree = new Int32Array(graph.cells);
  for (const [a, b] of graph.walls) {
    if (passages.has(edgeKey(a, b))) {
      degree[a]++;
      degree[b]++;
    }
  }
  return {
    id: { game: 'maze', size: mazeSizeToken(size), difficulty, seed },
    size,
    ringCells: graph.ringCells,
    walls: graph.walls,
    open: graph.walls.map(([a, b]) => passages.has(edgeKey(a, b))),
    start,
    end,
    solution,
    junctions: solution.filter(cell => degree[cell] >= JUNCTION_PASSAGES).length,
  };
}
