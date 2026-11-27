/**
 * Slitherlink (#391): one loop drawn along the dots of a square grid; a number in a cell says how
 * many of its four sides the loop takes. The method is Loopy's (Simon Tatham's Portable Puzzle
 * Collection, MIT): grow a random region of cells with no holes, take its border as the loop, give
 * every cell its count, then remove counts while a solver still finishes the grid alone. The code
 * is our own.
 *
 * Edges are numbered horizontal first: `h:c,r`, the top side of cell c, r (r runs to `height` for
 * the bottom border), at r * width + c; then `v:c,r`, the left side (c runs to `width`), after
 * them at r * (width + 1) + c. The keys are the ones `inkedEdges` reads from the ink.
 *
 * The bands are the solver's techniques: `easy` needs only the rules of one cell, one dot and the
 * loop; `medium` and `hard` also need trials (set an edge, follow the rules, and take the other
 * value when that breaks one), `hard` many of them. A puzzle the solver finishes has one solution:
 * every step it takes is forced.
 */
import { type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';

export interface SlitherlinkSize {
  width: number;
  height: number;
}

export interface Slitherlink {
  id: PuzzleId;
  width: number;
  height: number;
  /** Each cell's count, row by row, or null where no number is shown. */
  clues: (number | null)[];
  /** For each edge, in the order of `slitherlinkEdgeKeys`, true when the loop takes it. */
  solution: boolean[];
  /** How many trials the solver needed: 0 for easy. */
  trials: number;
}

export const SLITHERLINK_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
/** shortcut: sides past 10 take seconds on the tablet's engine; raise it after a measured device round. */
export const SLITHERLINK_LIMITS = { minSide: 4, maxSide: 10 } as const;
/** [inference] a medium puzzle needs 1 to this many trials, a hard one more; tuned so every band is found. */
export const MEDIUM_MAX_TRIALS = 3;
/** The region that draws the loop covers this share of the cells, in percent: a base and a seeded spread. */
const REGION_PERCENT = { base: 45, spread: 20 } as const;
const ATTEMPTS = 60;

const UNKNOWN = -1;
const OFF = 0;
const ON = 1;
const CELL_SIDES = 4;
const NONE = -1;

/** The fixed shape of one grid size: which edges each cell and each dot touches. */
interface Board {
  width: number;
  height: number;
  edges: number;
  /** Four edges per cell: top, bottom, left, right. */
  cellEdges: Int32Array;
  /** Four edge slots per dot, NONE where the border has none. */
  dotEdges: Int32Array;
  /** Two dots per edge. */
  edgeDots: Int32Array;
  /** Two cells per edge, NONE outside the grid. */
  edgeCells: Int32Array;
}

const boards = new Map<string, Board>();

function boardOf(width: number, height: number): Board {
  const key = `${width}x${height}`;
  const known = boards.get(key);
  if (known) return known;
  const horizontal = (height + 1) * width;
  const edges = horizontal + height * (width + 1);
  const h = (c: number, r: number): number => r * width + c;
  const v = (c: number, r: number): number => horizontal + r * (width + 1) + c;
  const dot = (x: number, y: number): number => y * (width + 1) + x;
  const cellEdges = new Int32Array(width * height * CELL_SIDES);
  const edgeCells = new Int32Array(edges * 2).fill(NONE);
  const edgeDots = new Int32Array(edges * 2);
  const dotEdges = new Int32Array((width + 1) * (height + 1) * CELL_SIDES).fill(NONE);
  const addCell = (edge: number, cell: number): void => {
    edgeCells[edge * 2 + (edgeCells[edge * 2] === NONE ? 0 : 1)] = cell;
  };
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell = r * width + c;
      const sides = [h(c, r), h(c, r + 1), v(c, r), v(c + 1, r)];
      sides.forEach((edge, i) => {
        cellEdges[cell * CELL_SIDES + i] = edge;
        addCell(edge, cell);
      });
    }
  }
  const link = (edge: number, a: number, b: number): void => {
    edgeDots[edge * 2] = a;
    edgeDots[edge * 2 + 1] = b;
    for (const d of [a, b]) {
      let slot = d * CELL_SIDES;
      while (dotEdges[slot] !== NONE) slot++;
      dotEdges[slot] = edge;
    }
  };
  for (let r = 0; r <= height; r++) for (let c = 0; c < width; c++) link(h(c, r), dot(c, r), dot(c + 1, r));
  for (let r = 0; r < height; r++) for (let c = 0; c <= width; c++) link(v(c, r), dot(c, r), dot(c, r + 1));
  const board = { width, height, edges, cellEdges, dotEdges, edgeDots, edgeCells };
  boards.set(key, board);
  return board;
}

/** The ink keys of every edge of a grid, in the order of a puzzle's `solution`. */
export function slitherlinkEdgeKeys(width: number, height: number): string[] {
  const keys: string[] = [];
  for (let r = 0; r <= height; r++) for (let c = 0; c < width; c++) keys.push(`h:${c},${r}`);
  for (let r = 0; r < height; r++) for (let c = 0; c <= width; c++) keys.push(`v:${c},${r}`);
  return keys;
}

/** The ink keys of the loop's edges. */
export function slitherlinkLoop(puzzle: Slitherlink): string[] {
  const keys = slitherlinkEdgeKeys(puzzle.width, puzzle.height);
  return keys.filter((_, i) => puzzle.solution[i]);
}

// ---------------------------------------------------------------------------------------------
// The rules

/** Union-find over the dots, for the loop rule. */
function findRoot(parent: Int32Array, x: number): number {
  let root = x;
  while (parent[root] !== root) root = parent[root];
  while (parent[x] !== root) {
    const next = parent[x];
    parent[x] = root;
    x = next;
  }
  return root;
}

/** Sets one edge and queues the cells and dots it touches; false on a clash with a set value. */
function setEdge(board: Board, state: Int8Array, edge: number, value: number, queue: number[]): boolean {
  if (state[edge] === value) return true;
  if (state[edge] !== UNKNOWN) return false;
  state[edge] = value;
  const dots = (board.width + 1) * (board.height + 1);
  for (let k = 0; k < 2; k++) {
    queue.push(board.edgeDots[edge * 2 + k]);
    const cell = board.edgeCells[edge * 2 + k];
    if (cell !== NONE) queue.push(dots + cell);
  }
  return true;
}

/** The rules of one cell and one dot, until nothing changes; false on a contradiction. */
function localRules(board: Board, clues: readonly (number | null)[], state: Int8Array, queue: number[]): boolean {
  const dots = (board.width + 1) * (board.height + 1);
  while (queue.length > 0) {
    const item = queue.pop() as number;
    const isDot = item < dots;
    const base = (isDot ? item : item - dots) * CELL_SIDES;
    const list = isDot ? board.dotEdges : board.cellEdges;
    const need = isDot ? null : clues[item - dots];
    if (!isDot && need === null) continue;
    let on = 0;
    let unknown = 0;
    for (let k = 0; k < CELL_SIDES; k++) {
      const edge = list[base + k];
      if (edge === NONE) continue;
      if (state[edge] === ON) on++;
      else if (state[edge] === UNKNOWN) unknown++;
    }
    let fill = NONE;
    if (isDot) {
      // A dot has 0 or 2 loop edges.
      if (on > 2 || (on === 1 && unknown === 0)) return false;
      if (on === 2 && unknown > 0) fill = OFF;
      else if (on === 1 && unknown === 1) fill = ON;
      else if (on === 0 && unknown === 1) fill = OFF;
    } else {
      const count = need as number;
      if (on > count || on + unknown < count) return false;
      if (unknown > 0 && on === count) fill = OFF;
      else if (unknown > 0 && on + unknown === count) fill = ON;
    }
    if (fill === NONE) continue;
    for (let k = 0; k < CELL_SIDES; k++) {
      const edge = list[base + k];
      if (edge !== NONE && state[edge] === UNKNOWN && !setEdge(board, state, edge, fill, queue)) return false;
    }
  }
  return true;
}

/** True when every count is met with the edges set on, all unknown edges taken as off, plus `extra`. */
function cluesMet(board: Board, clues: readonly (number | null)[], state: Int8Array, extra: number): boolean {
  for (let cell = 0; cell < clues.length; cell++) {
    const need = clues[cell];
    if (need === null) continue;
    let on = 0;
    for (let k = 0; k < CELL_SIDES; k++) {
      const edge = board.cellEdges[cell * CELL_SIDES + k];
      if (state[edge] === ON || edge === extra) on++;
    }
    if (on !== need) return false;
  }
  return true;
}

/**
 * The loop rule: one loop only. An edge that would close a chain is off unless that closes the
 * whole loop and meets every count; a closed loop that is not the whole loop is a contradiction, and
 * the whole loop closed turns every other edge off. Returns false on a contradiction, and queues
 * what it sets.
 */
function loopRule(board: Board, clues: readonly (number | null)[], state: Int8Array, queue: number[]): boolean {
  const dots = (board.width + 1) * (board.height + 1);
  const parent = new Int32Array(dots);
  for (let i = 0; i < dots; i++) parent[i] = i;
  const size = new Int32Array(dots);
  let total = 0;
  for (let edge = 0; edge < board.edges; edge++) {
    if (state[edge] !== ON) continue;
    total++;
    const a = findRoot(parent, board.edgeDots[edge * 2]);
    const b = findRoot(parent, board.edgeDots[edge * 2 + 1]);
    if (a !== b) {
      parent[a] = b;
      size[b] += size[a] + 1;
    } else size[b]++;
  }
  if (total === 0) return true;
  // A part with no open end is closed: each dot of a chain has two loop edges but its two ends.
  const open = new Uint8Array(dots);
  for (let d = 0; d < dots; d++) {
    let on = 0;
    for (let k = 0; k < CELL_SIDES; k++) {
      const edge = board.dotEdges[d * CELL_SIDES + k];
      if (edge !== NONE && state[edge] === ON) on++;
    }
    if (on === 1) open[findRoot(parent, d)] = 1;
  }
  for (let d = 0; d < dots; d++) {
    if (findRoot(parent, d) !== d || size[d] === 0 || open[d]) continue;
    if (size[d] !== total) return false;
    for (let edge = 0; edge < board.edges; edge++) {
      if (state[edge] === UNKNOWN && !setEdge(board, state, edge, OFF, queue)) return false;
    }
    return true;
  }
  for (let edge = 0; edge < board.edges; edge++) {
    if (state[edge] !== UNKNOWN) continue;
    const a = findRoot(parent, board.edgeDots[edge * 2]);
    if (a !== findRoot(parent, board.edgeDots[edge * 2 + 1])) continue;
    if (size[a] === total && cluesMet(board, clues, state, edge)) continue;
    if (!setEdge(board, state, edge, OFF, queue)) return false;
  }
  return true;
}

/** Every rule until nothing changes; false on a contradiction. */
function propagate(board: Board, clues: readonly (number | null)[], state: Int8Array, queue: number[]): boolean {
  for (;;) {
    if (!localRules(board, clues, state, queue)) return false;
    if (!loopRule(board, clues, state, queue)) return false;
    if (queue.length === 0) return true;
  }
}

/** Every item the local rules read, so a fresh state is checked in full. */
function everything(board: Board): number[] {
  const dots = (board.width + 1) * (board.height + 1);
  return Array.from({ length: dots + board.width * board.height }, (_, i) => i);
}

/** A finished grid: every edge set, every count met, and the loop edges one closed loop. */
function isSolution(board: Board, clues: readonly (number | null)[], state: Int8Array): boolean {
  if (state.some(value => value === UNKNOWN)) return false;
  if (!cluesMet(board, clues, state, NONE)) return false;
  const dots = (board.width + 1) * (board.height + 1);
  const parent = new Int32Array(dots);
  for (let i = 0; i < dots; i++) parent[i] = i;
  let total = 0;
  for (let d = 0; d < dots; d++) {
    let on = 0;
    for (let k = 0; k < CELL_SIDES; k++) {
      const edge = board.dotEdges[d * CELL_SIDES + k];
      if (edge !== NONE && state[edge] === ON) on++;
    }
    if (on !== 0 && on !== 2) return false;
  }
  for (let edge = 0; edge < board.edges; edge++) {
    if (state[edge] !== ON) continue;
    total++;
    parent[findRoot(parent, board.edgeDots[edge * 2])] = findRoot(parent, board.edgeDots[edge * 2 + 1]);
  }
  if (total === 0) return false;
  const roots = new Set<number>();
  for (let edge = 0; edge < board.edges; edge++) if (state[edge] === ON) roots.add(findRoot(parent, board.edgeDots[edge * 2]));
  return roots.size === 1;
}

function checkClues(width: number, height: number, clues: readonly (number | null)[]): void {
  for (const side of [width, height]) {
    if (!Number.isInteger(side) || side < SLITHERLINK_LIMITS.minSide || side > SLITHERLINK_LIMITS.maxSide) {
      throw new RangeError(`a slitherlink side is ${SLITHERLINK_LIMITS.minSide} to ${SLITHERLINK_LIMITS.maxSide} cells, not ${side}`);
    }
  }
  if (clues.length !== width * height) throw new RangeError(`a ${width} x ${height} slitherlink has ${width * height} cells, not ${clues.length}`);
  for (const clue of clues) {
    if (clue !== null && !(Number.isInteger(clue) && clue >= 0 && clue <= CELL_SIDES - 1)) throw new RangeError(`a count is 0 to 3, not ${clue}`);
  }
}

/**
 * How many solutions the counts allow, up to `limit`: a search over the edges, each branch first
 * followed by the rules. Independent of the rating, so a test can prove the rating's one solution.
 */
export function countSlitherlinkSolutions(width: number, height: number, clues: readonly (number | null)[], limit = 2): number {
  checkClues(width, height, clues);
  const board = boardOf(width, height);
  const search = (state: Int8Array, queue: number[], room: number): number => {
    if (!propagate(board, clues, state, queue)) return 0;
    let branch = NONE;
    for (let edge = 0; edge < board.edges && branch === NONE; edge++) if (state[edge] === UNKNOWN) branch = edge;
    if (branch === NONE) return isSolution(board, clues, state) ? 1 : 0;
    let found = 0;
    for (const value of [ON, OFF]) {
      if (found >= room) break;
      const next = state.slice();
      const nextQueue: number[] = [];
      setEdge(board, next, branch, value, nextQueue);
      found += search(next, nextQueue, room - found);
    }
    return found;
  };
  return search(new Int8Array(board.edges).fill(UNKNOWN), everything(board), limit);
}

/**
 * The solver that rates: the rules, then, while edges stay unknown and `maxTrials` allows, a trial
 * on each unknown edge in turn. Returns the solved edges and the trials used, or null when it stops
 * short or the counts contradict.
 */
function rate(board: Board, clues: readonly (number | null)[], maxTrials: number): { state: Int8Array; trials: number } | null {
  const state = new Int8Array(board.edges).fill(UNKNOWN);
  if (!propagate(board, clues, state, everything(board))) return null;
  let trials = 0;
  let progress = true;
  while (progress && state.includes(UNKNOWN)) {
    progress = false;
    // One sweep over the edges, going on after each forced one instead of starting again.
    for (let edge = 0; edge < board.edges; edge++) {
      if (state[edge] !== UNKNOWN) continue;
      for (const value of [ON, OFF]) {
        const trial = state.slice();
        const queue: number[] = [];
        setEdge(board, trial, edge, value, queue);
        if (propagate(board, clues, trial, queue)) continue;
        if (trials === maxTrials) return null;
        trials++;
        const forced: number[] = [];
        setEdge(board, state, edge, value === ON ? OFF : ON, forced);
        if (!propagate(board, clues, state, forced)) return null;
        progress = true;
        break;
      }
    }
  }
  return isSolution(board, clues, state) ? { state, trials } : null;
}

/** The trials the rating solver needs for these counts, or null when it cannot finish them. */
export function rateSlitherlink(width: number, height: number, clues: readonly (number | null)[]): number | null {
  checkClues(width, height, clues);
  return rate(boardOf(width, height), clues, Number.MAX_SAFE_INTEGER)?.trials ?? null;
}

// ---------------------------------------------------------------------------------------------
// Generation

/** Two cells across one dot inside and the other two outside: the loop would touch itself there. */
function pinches(inside: Uint8Array, width: number, height: number, cell: number): boolean {
  const at = (c: number, r: number): number => (c < 0 || r < 0 || c >= width || r >= height ? 0 : inside[r * width + c]);
  const c0 = cell % width;
  const r0 = Math.floor(cell / width);
  for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const a = at(c0 + dc, r0 + dr);
    const b = at(c0 + dc + 1, r0 + dr);
    const c = at(c0 + dc, r0 + dr + 1);
    const d = at(c0 + dc + 1, r0 + dr + 1);
    if (a === d && b === c && a !== b) return true;
  }
  return false;
}

/** Every outside cell still reaches the grid's border through outside cells, so the region has no hole. */
function outsideConnected(inside: Uint8Array, width: number, height: number): boolean {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  let outside = 0;
  for (let cell = 0; cell < width * height; cell++) {
    if (inside[cell]) continue;
    outside++;
    const c = cell % width;
    const r = Math.floor(cell / width);
    if (c === 0 || r === 0 || c === width - 1 || r === height - 1) {
      seen[cell] = 1;
      stack.push(cell);
    }
  }
  let reached = stack.length;
  while (stack.length > 0) {
    const cell = stack.pop() as number;
    const c = cell % width;
    const r = Math.floor(cell / width);
    const next = [c > 0 ? cell - 1 : NONE, c < width - 1 ? cell + 1 : NONE, r > 0 ? cell - width : NONE, r < height - 1 ? cell + width : NONE];
    for (const n of next) {
      if (n === NONE || inside[n] || seen[n]) continue;
      seen[n] = 1;
      reached++;
      stack.push(n);
    }
  }
  return reached === outside;
}

/** A region of cells, joined and with no hole, whose border is one simple loop. */
function growRegion(random: Random, width: number, height: number): Uint8Array {
  const cells = width * height;
  const inside = new Uint8Array(cells);
  inside[random.int(cells)] = 1;
  const target = Math.floor((cells * (REGION_PERCENT.base + random.int(REGION_PERCENT.spread + 1))) / 100);
  for (let count = 1; count < target; count++) {
    const frontier: number[] = [];
    for (let cell = 0; cell < cells; cell++) {
      if (inside[cell]) continue;
      const c = cell % width;
      const r = Math.floor(cell / width);
      if ((c > 0 && inside[cell - 1]) || (c < width - 1 && inside[cell + 1]) || (r > 0 && inside[cell - width]) || (r < height - 1 && inside[cell + width])) {
        frontier.push(cell);
      }
    }
    random.shuffle(frontier);
    let added = false;
    for (const cell of frontier) {
      inside[cell] = 1;
      if (!pinches(inside, width, height, cell) && outsideConnected(inside, width, height)) {
        added = true;
        break;
      }
      inside[cell] = 0;
    }
    if (!added) break;
  }
  return inside;
}

/** Each cell's count: its sides between the region and the rest, the outside of the grid outside. */
function countsOf(inside: Uint8Array, width: number, height: number): number[] {
  const at = (c: number, r: number): number => (c < 0 || r < 0 || c >= width || r >= height ? 0 : inside[r * width + c]);
  const counts: number[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const own = at(c, r);
      counts.push([at(c, r - 1), at(c, r + 1), at(c - 1, r), at(c + 1, r)].filter(n => n !== own).length);
    }
  }
  return counts;
}

/** The trials a band's removal may reach. */
const BAND_TRIALS: Record<string, number> = { easy: 0, medium: MEDIUM_MAX_TRIALS, hard: Number.MAX_SAFE_INTEGER };

/**
 * A slitherlink of the given size and band from the seed. Throws on a side outside 4 to 10, a band
 * not offered, or when the attempts run out.
 */
export function generateSlitherlink(seed: string, size: SlitherlinkSize, difficulty: Difficulty): Slitherlink {
  const { width, height } = size;
  checkClues(width, height, new Array<null>(width * height).fill(null));
  if (!SLITHERLINK_BANDS.includes(difficulty)) {
    throw new RangeError(`a slitherlink offers ${SLITHERLINK_BANDS.join(', ')}, not ${difficulty}`);
  }
  const board = boardOf(width, height);
  const cap = BAND_TRIALS[difficulty];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const random = createRandom(childSeed(seed, attempt));
    const inside = growRegion(random, width, height);
    const clues: (number | null)[] = countsOf(inside, width, height);
    let result = rate(board, clues, cap);
    if (!result) continue;
    for (const cell of random.shuffle(Array.from({ length: clues.length }, (_, i) => i))) {
      const kept = clues[cell];
      clues[cell] = null;
      const next = rate(board, clues, cap);
      if (next) result = next;
      else clues[cell] = kept;
    }
    const band = result.trials === 0 ? 'easy' : result.trials <= MEDIUM_MAX_TRIALS ? 'medium' : 'hard';
    if (band !== difficulty) continue;
    return {
      id: { game: 'slitherlink', size: `${width}X${height}`, difficulty, seed },
      width,
      height,
      clues,
      solution: Array.from(result.state, value => value === ON),
      trials: result.trials,
    };
  }
  throw new Error(`no ${difficulty} ${width} x ${height} slitherlink from seed «${seed}» in ${ATTEMPTS} attempts`);
}
