/**
 * Nonograms (#380): a seeded picture, its row and column clues, and a solver that proves the
 * clues name that one picture.
 *
 * The band comes from the solve: `easy` when line solving (every placement of each row and column
 * at once) finishes in few sweeps, `medium` when it needs more, `hard` when it also needs probing
 * (a cell whose one value breaks a line). A picture that still needs a guess is never offered.
 */

import { type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';

export interface NonogramSize {
  width: number;
  height: number;
}

export interface Nonogram {
  id: PuzzleId;
  width: number;
  height: number;
  /** Block lengths per row, top to bottom; an empty row has none. */
  rows: number[][];
  columns: number[][];
  /** Row by row, true for a filled cell. */
  solution: boolean[];
}

export const NONOGRAM_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const NONOGRAM_MIN_SIDE = 5;
export const NONOGRAM_MAX_SIDE = 25; // a 30 x 30 «medium» was not found within the attempts for every seed

const UNKNOWN = -1;
const EMPTY = 0;
const FILLED = 1;
type Cell = typeof UNKNOWN | typeof EMPTY | typeof FILLED;

/** The clue of one line: the lengths of its runs of filled cells. */
export function lineClue(cells: readonly boolean[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const filled of cells) {
    if (filled) run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out;
}

/**
 * Every cell all placements of the clue agree on, given what is known (full line solving). Returns
 * null when no placement fits. Prefix and suffix tables make it linear in length times blocks.
 */
/**
 * The line solver's tables, kept between calls and grown when a longer line comes: the tablet's
 * engine has no JIT, and allocating them on each of the thousands of calls of one generation was
 * a large part of its time (#380). The solver is never re-entered, so one set serves every call.
 */
const tables = { blocked: new Int32Array(0), prefix: new Uint8Array(0), suffix: new Uint8Array(0), mayEmpty: new Uint8Array(0), fillCount: new Int32Array(0) };

function tablesFor(n: number, w: number): typeof tables {
  const cells = (n + 2) * w;
  if (tables.blocked.length < n + 1) {
    tables.blocked = new Int32Array(n + 1);
    tables.mayEmpty = new Uint8Array(n);
    tables.fillCount = new Int32Array(n + 1);
  }
  if (tables.prefix.length < cells) {
    tables.prefix = new Uint8Array(cells);
    tables.suffix = new Uint8Array(cells);
  }
  tables.prefix.fill(0, 0, cells);
  tables.suffix.fill(0, 0, cells);
  tables.mayEmpty.fill(0, 0, n);
  tables.fillCount.fill(0, 0, n + 1);
  return tables;
}

/** Line solving of one line, as `solveLine`, writing the result into `out`; false on a contradiction. */
function lineSolve(clue: readonly number[], line: ArrayLike<number>, n: number, out: Int8Array): boolean {
  const k = clue.length;
  // The tables are flat, row i at i * w. Checks are written inline, not as helper calls: a call
  // costs much on an engine with no JIT.
  const w = k + 1;
  const { blocked, prefix, suffix, mayEmpty, fillCount } = tablesFor(n, w);
  // blocked[i] counts cells before i that must stay empty, so a block's range is checked in O(1).
  blocked[0] = 0;
  for (let i = 0; i < n; i++) blocked[i + 1] = blocked[i] + (line[i] === EMPTY ? 1 : 0);

  // prefix[i][j]: cells [0, i) hold exactly the first j blocks.
  prefix[0] = 1;
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j <= k; j++) {
      let ok = line[i - 1] !== FILLED && prefix[(i - 1) * w + j] === 1;
      if (!ok && j > 0) {
        const s = clue[j - 1];
        const start = i - s;
        if (start >= 0 && blocked[start + s] === blocked[start]) ok = start === 0 ? j === 1 : line[start - 1] !== FILLED && prefix[(start - 1) * w + j - 1] === 1;
      }
      if (ok) prefix[i * w + j] = 1;
    }
  }
  if (!prefix[n * w + k]) return false;
  // suffix[i][j]: cells [i, n) hold exactly blocks j to k-1.
  suffix[n * w + k] = 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      let ok = line[i] !== FILLED && suffix[(i + 1) * w + j] === 1;
      if (!ok && j < k) {
        const s = clue[j];
        const end = i + s;
        if (end <= n && blocked[i + s] === blocked[i]) ok = end === n ? j === k - 1 : line[end] !== FILLED && suffix[(end + 1) * w + j + 1] === 1;
      }
      if (ok) suffix[i * w + j] = 1;
    }
  }

  for (let i = 0; i < n; i++) {
    if (line[i] === FILLED) continue;
    for (let j = 0; j <= k && !mayEmpty[i]; j++) if (prefix[i * w + j] && suffix[(i + 1) * w + j]) mayEmpty[i] = 1;
  }
  for (let j = 0; j < k; j++) {
    const s = clue[j];
    for (let p = 0; p + s <= n; p++) {
      if (blocked[p + s] !== blocked[p]) continue;
      const before = p === 0 ? j === 0 : line[p - 1] !== FILLED && prefix[(p - 1) * w + j] === 1;
      if (!before) continue;
      const end = p + s;
      const after = end === n ? j === k - 1 : line[end] !== FILLED && suffix[(end + 1) * w + j + 1] === 1;
      if (!after) continue;
      fillCount[p]++;
      fillCount[end]--;
    }
  }
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += fillCount[i];
    const mayFill = running > 0;
    if (!mayFill && !mayEmpty[i]) return false;
    out[i] = mayFill && mayEmpty[i] ? UNKNOWN : mayFill ? FILLED : EMPTY;
  }
  return true;
}

export function solveLine(clue: readonly number[], line: readonly Cell[]): Cell[] | null {
  const out = new Int8Array(line.length);
  return lineSolve(clue, line, line.length, out) ? (Array.from(out) as Cell[]) : null;
}

interface Grid {
  width: number;
  height: number;
  rows: readonly (readonly number[])[];
  columns: readonly (readonly number[])[];
}

/** The clues with the cells of every line (rows, then columns), built once per solve. */
interface Lines {
  grid: Grid;
  cells: number[][];
  clues: (readonly number[])[];
}

function linesOf(grid: Grid): Lines {
  const cells: number[][] = [];
  for (let r = 0; r < grid.height; r++) cells.push(Array.from({ length: grid.width }, (_, c) => r * grid.width + c));
  for (let c = 0; c < grid.width; c++) cells.push(Array.from({ length: grid.height }, (_, r) => r * grid.width + c));
  return { grid, cells, clues: [...grid.rows, ...grid.columns] };
}

/** The row and the column line of a cell. */
const crossOf = (grid: Grid, cell: number): [number, number] => [Math.floor(cell / grid.width), grid.height + (cell % grid.width)];

/** A page of cells: UNKNOWN, EMPTY or FILLED, row by row. A typed array copies natively for a probe. */
type Cells = Int8Array;

/**
 * The buffers of `solveInPlace`, kept between calls like the line tables (#434): one line's known
 * cells, its solution, and the cells a call set, which the caller reads before the next call.
 */
const lineBuffers = { known: new Int8Array(0), solved: new Int8Array(0), set: new Int32Array(0) };

function newCells(grid: Grid): Cells {
  return new Int8Array(grid.width * grid.height).fill(UNKNOWN);
}

/**
 * Solves one line in place; returns how many cells it set, listed in `lineBuffers.set`, or -1 on
 * a contradiction.
 */
function solveInPlace(lines: Lines, cells: Cells, line: number): number {
  const at = lines.cells[line];
  const n = at.length;
  if (lineBuffers.known.length < n) {
    lineBuffers.known = new Int8Array(n);
    lineBuffers.solved = new Int8Array(n);
    lineBuffers.set = new Int32Array(n);
  }
  const { known, solved, set } = lineBuffers;
  let open = false;
  for (let i = 0; i < n; i++) {
    known[i] = cells[at[i]];
    if (known[i] === UNKNOWN) open = true;
  }
  if (!lineSolve(lines.clues[line], known, n, solved)) return -1;
  if (!open) return 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const cell = at[i];
    if (cells[cell] === UNKNOWN && solved[i] !== UNKNOWN) {
      cells[cell] = solved[i];
      set[count++] = cell;
    }
  }
  return count;
}

/** Line solving to a fixed point, revisiting only the lines a new cell touches; false on a contradiction. */
function propagate(lines: Lines, cells: Cells, dirty: number[] = lines.cells.map((_, i) => i)): boolean {
  const { grid } = lines;
  const queued = new Array<boolean>(grid.height + grid.width).fill(false);
  const queue: number[] = [];
  for (let i = 0; i < dirty.length; i++) {
    if (!queued[dirty[i]]) {
      queued[dirty[i]] = true;
      queue.push(dirty[i]);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const line = queue[head];
    queued[line] = false;
    const count = solveInPlace(lines, cells, line);
    if (count < 0) return false;
    const set = lineBuffers.set;
    // A cell a row set touches its column, and the other way round; the line itself is done.
    for (let i = 0; i < count; i++) {
      const other = line < grid.height ? grid.height + (set[i] % grid.width) : Math.floor(set[i] / grid.width);
      if (!queued[other]) {
        queued[other] = true;
        queue.push(other);
      }
    }
  }
  return true;
}

/** Solutions of the clues, counted up to `limit`, by line solving and branching on a cell. */
export function countNonogramSolutions(grid: Grid, limit = 2): number {
  const lines = linesOf(grid);
  const search = (cells: Cells): number => {
    if (!propagate(lines, cells)) return 0;
    const open = cells.indexOf(UNKNOWN);
    if (open < 0) return 1;
    let count = 0;
    for (const value of [FILLED, EMPTY] as const) {
      const next = cells.slice();
      next[open] = value;
      count += search(next);
      if (count >= limit) return count;
    }
    return count;
  };
  return search(newCells(grid));
}

export interface NonogramRating {
  difficulty: Difficulty;
  /** Sweeps over every row and column that line solving needed. */
  sweeps: number;
  /** Cells set by probing. */
  probes: number;
}

/** Up to this many sweeps per 10 cells of the longer side, a line-solvable picture is easy. */
const EASY_SWEEPS_PER_10 = 3;

/**
 * The rating of the clues, or null when line solving and probing cannot finish them (a guess
 * would be needed). Line solving that needs few sweeps is `easy`, more sweeps `medium`, and any
 * probing `hard`.
 */
export function rateNonogram(grid: Grid): NonogramRating | null {
  return rateTowards(grid, null);
}

/**
 * `rateNonogram`, but with a `target` band it gives up, returning null, as soon as the clues
 * cannot rate that band: past the easy sweeps for `easy`, and before probing for `easy` and
 * `medium`. The generator rejects most pictures this way, and probing is the slow part (#380).
 */
function rateTowards(grid: Grid, target: Difficulty | null): NonogramRating | null {
  const cells = newCells(grid);
  const lines = linesOf(grid);
  const count = lines.cells.length;
  const easyLimit = Math.ceil((Math.max(grid.width, grid.height) * EASY_SWEEPS_PER_10) / 10);
  // A line none of whose cells changed since it was solved would give the same answer again
  // (line solving finds all it can at once), so a sweep skips it; the sweep count is unchanged.
  const dirty = new Array<boolean>(count).fill(true);
  let sweeps = 0;
  for (let changed = true; changed; ) {
    changed = false;
    sweeps++;
    for (let line = 0; line < count; line++) {
      if (!dirty[line]) continue;
      dirty[line] = false;
      const setCount = solveInPlace(lines, cells, line);
      if (setCount < 0) return null;
      if (setCount === 0) continue;
      changed = true;
      const set = lineBuffers.set;
      for (let i = 0; i < setCount; i++) {
        const [row, column] = crossOf(grid, set[i]);
        dirty[line < grid.height ? column : row] = true;
      }
    }
    // A sweep that changed cells counts; one more past the limit cannot rate easy.
    if (target === 'easy' && changed && sweeps > easyLimit) return null;
  }
  sweeps--; // the last sweep only confirmed the fixed point
  if (target !== null && target !== 'hard' && cells.includes(UNKNOWN)) return null;
  // Probing: a value of an open cell that breaks a line fixes the other value. A probe that fails
  // stays failed as more cells become known, so one scan goes on after a probe instead of
  // starting over, and the scans end when one sets nothing.
  //
  // A trial that ends with no contradiction proves more than its own value: every cell it set
  // follows from it, so setting that cell alone reaches a subset of the same fixed point and cannot
  // break a line either. Those values are marked and not tried again until a probe changes the
  // grid. The probes found, and so the rating and the puzzle, are the same; only the wasted trials
  // go (#434: they were most of a large hard nonogram's time).
  let probes = 0;
  const known = new Uint8Array(cells.length * 2);
  const slot = (cell: number, value: number) => 2 * cell + (value === FILLED ? 0 : 1);
  for (let probed = true; probed && cells.includes(UNKNOWN); ) {
    probed = false;
    known.fill(0);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== UNKNOWN) continue;
      for (const value of [FILLED, EMPTY] as const) {
        if (known[slot(i, value)]) continue;
        const trial = cells.slice();
        trial[i] = value;
        if (!propagate(lines, trial, crossOf(grid, i))) {
          cells[i] = value === FILLED ? EMPTY : FILLED;
          if (!propagate(lines, cells, crossOf(grid, i))) return null;
          probes++;
          probed = true;
          known.fill(0);
          break;
        }
        for (let j = 0; j < trial.length; j++) if (cells[j] === UNKNOWN && trial[j] !== UNKNOWN) known[slot(j, trial[j])] = 1;
      }
    }
  }
  if (cells.includes(UNKNOWN)) return null;
  const difficulty: Difficulty = probes > 0 ? 'hard' : sweeps <= easyLimit ? 'easy' : 'medium';
  return { difficulty, sweeps, probes };
}

/** A seeded picture: random cells, then two rounds of majority smoothing, so it has shapes, not noise. */
function picture(random: Random, width: number, height: number, density: number): boolean[] {
  let cells = Array.from({ length: width * height }, () => random.chance(density));
  for (let round = 0; round < 2; round++) {
    cells = cells.map((filled, i) => {
      const r = Math.floor(i / width);
      const c = i % width;
      let on = 0;
      let all = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= height || cc >= width) continue;
          all++;
          if (cells[rr * width + cc]) on++;
        }
      }
      // A tie keeps the cell, so the result does not depend on the order of the scan.
      return on * 2 === all ? filled : on * 2 > all;
    });
  }
  return cells;
}

export function cluesOf(width: number, height: number, solution: readonly boolean[]): Grid {
  const rows: number[][] = [];
  const columns: number[][] = [];
  for (let r = 0; r < height; r++) rows.push(lineClue(solution.slice(r * width, r * width + width)));
  for (let c = 0; c < width; c++) columns.push(lineClue(Array.from({ length: height }, (_, r) => solution[r * width + c])));
  return { width, height, rows, columns };
}

const NONOGRAM_ATTEMPTS = 360;
/**
 * A small picture rarely needs probing, so a hard one can take more than the attempts: 5 x 5 hard
 * found none for seed S2 (#380). A picture under 100 cells gets attempts up to this budget over its
 * cells (1 440 for 5 x 5); each costs little, and one found within the first 360 is unchanged.
 */
const SMALL_PICTURE_BUDGET = 36000;

function attemptsFor(cells: number): number {
  return Math.max(NONOGRAM_ATTEMPTS, Math.ceil(SMALL_PICTURE_BUDGET / cells));
}
/**
 * Fill chance in percent before smoothing, per band: denser pictures tend to need less. Each value
 * gives its band most often over sides 10 to 25 (#380: at 55 and 50, under 1 % of 15 x 10 pictures
 * rated medium or hard, so a puzzle took hundreds of attempts or none was found).
 */
const DENSITY: Record<string, number> = { easy: 62, medium: 45, hard: 40 };

/**
 * A nonogram of the given size and band from the seed. Throws on a side outside 5 to 30, a band not
 * offered, or when the attempts run out.
 */
export function generateNonogram(seed: string, size: NonogramSize, difficulty: Difficulty): Nonogram {
  const { width, height } = size;
  for (const side of [width, height]) {
    if (!Number.isInteger(side) || side < NONOGRAM_MIN_SIDE || side > NONOGRAM_MAX_SIDE) {
      throw new RangeError(`a nonogram side is ${NONOGRAM_MIN_SIDE} to ${NONOGRAM_MAX_SIDE} cells, not ${side}`);
    }
  }
  if (!NONOGRAM_BANDS.includes(difficulty)) throw new RangeError(`a nonogram offers ${NONOGRAM_BANDS.join(', ')}, not ${difficulty}`);
  const attempts = attemptsFor(width * height);
  for (let i = 0; i < attempts; i++) {
    const random = createRandom(childSeed(seed, i));
    const solution = picture(random, width, height, DENSITY[difficulty]);
    const filled = solution.filter(Boolean).length;
    if (filled === 0 || filled === solution.length) continue;
    const grid = cluesOf(width, height, solution);
    // A rating proves uniqueness: every deduction it makes is forced, and it finishes the grid.
    if (rateTowards(grid, difficulty)?.difficulty !== difficulty) continue;
    return {
      id: { game: 'nonogram', size: `${width}X${height}`, difficulty, seed },
      width,
      height,
      rows: grid.rows.map(r => r.slice()),
      columns: grid.columns.map(c => c.slice()),
      solution,
    };
  }
  throw new Error(`no ${difficulty} ${width} x ${height} nonogram from seed «${seed}» in ${attempts} attempts`);
}
