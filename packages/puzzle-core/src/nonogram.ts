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
export function solveLine(clue: readonly number[], line: readonly Cell[]): Cell[] | null {
  const n = line.length;
  const k = clue.length;
  const canEmpty = (i: number): boolean => line[i] !== FILLED;
  // blocked[i] counts cells before i that must stay empty, so a block's range is checked in O(1).
  const blocked = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) blocked[i + 1] = blocked[i] + (line[i] === EMPTY ? 1 : 0);
  const fits = (start: number, length: number): boolean => blocked[start + length] - blocked[start] === 0;

  // prefix[i][j]: cells [0, i) hold exactly the first j blocks.
  const prefix: boolean[][] = Array.from({ length: n + 1 }, () => new Array<boolean>(k + 1).fill(false));
  prefix[0][0] = true;
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j <= k; j++) {
      let ok = canEmpty(i - 1) && prefix[i - 1][j];
      if (!ok && j > 0) {
        const s = clue[j - 1];
        const start = i - s;
        if (start >= 0 && fits(start, s)) ok = start === 0 ? j === 1 : canEmpty(start - 1) && prefix[start - 1][j - 1];
      }
      prefix[i][j] = ok;
    }
  }
  if (!prefix[n][k]) return null;
  // suffix[i][j]: cells [i, n) hold exactly blocks j to k-1.
  const suffix: boolean[][] = Array.from({ length: n + 2 }, () => new Array<boolean>(k + 1).fill(false));
  suffix[n][k] = true;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      let ok = canEmpty(i) && suffix[i + 1][j];
      if (!ok && j < k) {
        const s = clue[j];
        const end = i + s;
        if (end <= n && fits(i, s)) ok = end === n ? j === k - 1 : canEmpty(end) && suffix[end + 1][j + 1];
      }
      suffix[i][j] = ok;
    }
  }

  const mayEmpty = new Array<boolean>(n).fill(false);
  const fillCount = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    if (!canEmpty(i)) continue;
    for (let j = 0; j <= k && !mayEmpty[i]; j++) if (prefix[i][j] && suffix[i + 1][j]) mayEmpty[i] = true;
  }
  for (let j = 0; j < k; j++) {
    const s = clue[j];
    for (let p = 0; p + s <= n; p++) {
      if (!fits(p, s)) continue;
      const before = p === 0 ? j === 0 : canEmpty(p - 1) && prefix[p - 1][j];
      if (!before) continue;
      const end = p + s;
      const after = end === n ? j === k - 1 : canEmpty(end) && suffix[end + 1][j + 1];
      if (!after) continue;
      fillCount[p]++;
      fillCount[end]--;
    }
  }
  const out: Cell[] = [];
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += fillCount[i];
    const mayFill = running > 0;
    if (!mayFill && !mayEmpty[i]) return null;
    out.push(mayFill && mayEmpty[i] ? UNKNOWN : mayFill ? FILLED : EMPTY);
  }
  return out;
}

interface Grid {
  width: number;
  height: number;
  rows: readonly (readonly number[])[];
  columns: readonly (readonly number[])[];
}

const lineCells = (grid: Grid, line: number): number[] =>
  line < grid.height
    ? Array.from({ length: grid.width }, (_, c) => line * grid.width + c)
    : Array.from({ length: grid.height }, (_, r) => r * grid.width + (line - grid.height));
const clueOf = (grid: Grid, line: number): readonly number[] => (line < grid.height ? grid.rows[line] : grid.columns[line - grid.height]);

/** Solves one line in place; returns the cells it set, or null on a contradiction. */
function solveInPlace(grid: Grid, cells: Cell[], line: number): number[] | null {
  const at = lineCells(grid, line);
  const solved = solveLine(clueOf(grid, line), at.map(i => cells[i]));
  if (!solved) return null;
  const set: number[] = [];
  at.forEach((cell, i) => {
    if (cells[cell] === UNKNOWN && solved[i] !== UNKNOWN) {
      cells[cell] = solved[i];
      set.push(cell);
    }
  });
  return set;
}

/** Line solving to a fixed point, revisiting only the lines a new cell touches; false on a contradiction. */
function propagate(grid: Grid, cells: Cell[], dirty: number[] = Array.from({ length: grid.height + grid.width }, (_, i) => i)): boolean {
  const queued = new Array<boolean>(grid.height + grid.width).fill(false);
  const queue: number[] = [];
  for (const line of dirty) {
    if (!queued[line]) {
      queued[line] = true;
      queue.push(line);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const line = queue[head];
    queued[line] = false;
    const set = solveInPlace(grid, cells, line);
    if (!set) return false;
    for (const cell of set) {
      const row = Math.floor(cell / grid.width);
      const column = grid.height + (cell % grid.width);
      for (const other of [row, column]) {
        if (other !== line && !queued[other]) {
          queued[other] = true;
          queue.push(other);
        }
      }
    }
  }
  return true;
}

/** Solutions of the clues, counted up to `limit`, by line solving and branching on a cell. */
export function countNonogramSolutions(grid: Grid, limit = 2): number {
  const search = (cells: Cell[]): number => {
    if (!propagate(grid, cells)) return 0;
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
  return search(new Array<Cell>(grid.width * grid.height).fill(UNKNOWN));
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
  const cells = new Array<Cell>(grid.width * grid.height).fill(UNKNOWN);
  const lines = grid.height + grid.width;
  let sweeps = 0;
  for (let changed = true; changed; ) {
    changed = false;
    sweeps++;
    for (let line = 0; line < lines; line++) {
      const set = solveInPlace(grid, cells, line);
      if (!set) return null;
      if (set.length) changed = true;
    }
  }
  sweeps--; // the last sweep only confirmed the fixed point
  let probes = 0;
  while (cells.includes(UNKNOWN)) {
    let probed = false;
    for (let i = 0; i < cells.length && !probed; i++) {
      if (cells[i] !== UNKNOWN) continue;
      for (const value of [FILLED, EMPTY] as const) {
        const trial = cells.slice();
        trial[i] = value;
        if (!propagate(grid, trial, [Math.floor(i / grid.width), grid.height + (i % grid.width)])) {
          cells[i] = value === FILLED ? EMPTY : FILLED;
          if (!propagate(grid, cells, [Math.floor(i / grid.width), grid.height + (i % grid.width)])) return null;
          probes++;
          probed = true;
          break;
        }
      }
    }
    if (!probed) return null;
  }
  const easyLimit = Math.ceil((Math.max(grid.width, grid.height) * EASY_SWEEPS_PER_10) / 10);
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
/** Fill chance in percent before smoothing, per band: denser pictures tend to need less. */
const DENSITY: Record<string, number> = { easy: 62, medium: 55, hard: 50 };

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
  for (let i = 0; i < NONOGRAM_ATTEMPTS; i++) {
    const random = createRandom(childSeed(seed, i));
    const solution = picture(random, width, height, DENSITY[difficulty]);
    const filled = solution.filter(Boolean).length;
    if (filled === 0 || filled === solution.length) continue;
    const grid = cluesOf(width, height, solution);
    // A rating proves uniqueness: every deduction it makes is forced, and it finishes the grid.
    if (rateNonogram(grid)?.difficulty !== difficulty) continue;
    return {
      id: { game: 'nonogram', size: `${width}X${height}`, difficulty, seed },
      width,
      height,
      rows: grid.rows.map(r => r.slice()),
      columns: grid.columns.map(c => c.slice()),
      solution,
    };
  }
  throw new Error(`no ${difficulty} ${width} x ${height} nonogram from seed «${seed}» in ${NONOGRAM_ATTEMPTS} attempts`);
}
