/**
 * Calcudoku (#388): an n x n Latin square cut into cages, each cage labelled with a target and an
 * operation. The player writes 1 to n once in each row and column so each cage's digits make its
 * target with its operation. Generation follows the design of Simon Tatham's Keen (MIT), written
 * here from the rules: a seeded Latin square, cages grown on it, an operation per cage that its
 * digits allow, and a uniqueness proof, attempt after attempt until the band is met.
 *
 * The band sets the cages and how a player can solve them:
 *
 * - `easy`: plus and minus only, cages of one to three cells, finished by plain deduction;
 * - `medium`: all four operations, cages of one to three cells, finished by plain deduction;
 * - `hard`: all four operations, cages of two to four cells, finished by plain deduction;
 * - `expert`: cages of two to four cells that plain deduction does not finish: one solution,
 *   proved by the exact-cover counter, but the player must look further ahead.
 *
 * Plain deduction is the solver below: each cage keeps only the digit tuples its cells still allow,
 * and each row and column places its naked and hidden singles.
 * shortcut: the band is the cage shape and that one solver, not a human-technique rating like
 * sudoku's; add techniques (cage sums across a row, pairs) when the device round finds the bands
 * too close.
 */

import { type Difficulty, type PuzzleId } from './code';
import { searchExactCover, type ExactCoverProblem } from './exact-cover';
import { childSeed, createRandom, type Random } from './random';

/**
 * The operations a cage can carry. `=` is a one-cell cage that names its digit. Division prints
 * as `/`: the page font has no `÷`.
 * shortcut: `/` for division, until `scripts/font-outlines.swift` adds U+00F7 on the Mac.
 */
export type CalcudokuOperation = '+' | '-' | '×' | '/' | '=';

export interface CalcudokuCage {
  /** The cage's cells, row * size + column, in reading order. */
  cells: number[];
  operation: CalcudokuOperation;
  target: number;
}

export interface Calcudoku {
  id: PuzzleId;
  size: number;
  /** Every cell is in exactly one cage. */
  cages: CalcudokuCage[];
  /** Row by row, 1 to size. */
  solution: number[];
}

/** A cell holds one digit, so 9 is the largest side; 4 is the least where cages leave a choice. */
export const CALCUDOKU_LIMITS = { minSide: 4, maxSide: 9 } as const;

/**
 * The sides offered and the bands each reaches: a band is offered only where the attempts found it
 * for every seed tried. Plain deduction rarely finishes an 8 x 8 or 9 x 9 of large cages, and a
 * 9 x 9 expert took seconds per puzzle under Node, too slow for the tablet.
 */
export const CALCUDOKU_SIZES: Readonly<Record<number, readonly Difficulty[]>> = {
  4: ['easy', 'medium', 'hard', 'expert'],
  5: ['easy', 'medium', 'hard', 'expert'],
  6: ['easy', 'medium', 'hard', 'expert'],
  7: ['easy', 'medium', 'hard', 'expert'],
  8: ['easy', 'medium', 'expert'],
  9: ['easy', 'medium'],
};

interface BandRule {
  operations: readonly CalcudokuOperation[];
  /** Cage sizes drawn with these weights: index 0 is a one-cell cage. */
  sizeWeights: readonly number[];
  /** True when plain deduction must finish the puzzle; false when it must not. */
  deducible: boolean;
}

const BAND_RULES: Readonly<Record<Difficulty, BandRule>> = {
  easy: { operations: ['+', '-'], sizeWeights: [1, 4, 2], deducible: true },
  medium: { operations: ['+', '-', '×', '/'], sizeWeights: [1, 4, 3], deducible: true },
  hard: { operations: ['+', '-', '×', '/'], sizeWeights: [0, 3, 4, 2], deducible: true },
  expert: { operations: ['+', '-', '×', '/'], sizeWeights: [0, 2, 4, 3], deducible: false },
};

/** How many seeded attempts a band gets before generation gives up with an error. */
const CALCUDOKU_ATTEMPTS = 450;
/** A two-cell cage takes minus or division over plus or times with this chance, in percent. */
const PAIR_DIFFERENCE_CHANCE = 60;
/** A cage of three or more cells takes times over plus with this chance, in percent. */
const PRODUCT_CHANCE = 40;
/** Cages of two cells are the only ones that can carry minus or division. */
const PAIR = 2;

const sizeToken = (size: number): string => String(size);

/** Throws unless the side and the band are offered. */
function requireOffered(size: number, difficulty: Difficulty): void {
  const bands = CALCUDOKU_SIZES[size];
  if (!Number.isInteger(size) || !bands) {
    throw new RangeError(`a calcudoku is ${CALCUDOKU_LIMITS.minSide} to ${CALCUDOKU_LIMITS.maxSide} cells across, not ${size}`);
  }
  if (!bands.includes(difficulty)) throw new RangeError(`a ${size} x ${size} calcudoku offers ${bands.join(', ')}, not ${difficulty}`);
}

/** True when the values make the target with the operation. */
export function cageHolds(operation: CalcudokuOperation, target: number, values: readonly number[]): boolean {
  if (operation === '=') return values.length === 1 && values[0] === target;
  if (operation === '+') return values.reduce((a, b) => a + b, 0) === target;
  if (operation === '×') return values.reduce((a, b) => a * b, 1) === target;
  if (values.length !== PAIR) return false;
  const [high, low] = values[0] >= values[1] ? values : [values[1], values[0]];
  return operation === '-' ? high - low === target : low * target === high;
}

/** The signs as the page prints them: minus as the font's en dash, wider than a hyphen. */
const PRINTED_SIGN: Readonly<Record<CalcudokuOperation, string>> = { '+': '+', '-': '–', '×': '×', '/': '/', '=': '' };

/** The cage's label as the page prints it: `12+`, `3–`, `24×`, `2/`, or the digit of a one-cell cage. */
export function cageLabel(cage: CalcudokuCage): string {
  return `${cage.target}${PRINTED_SIGN[cage.operation]}`;
}

/**
 * Every tuple of digits the cage's cells can hold (in the order of `cells`): each 1 to size, two
 * cells in one row or column never equal, and the tuple making the target.
 */
function cageTuples(size: number, cage: CalcudokuCage): number[][] {
  const { cells, operation, target } = cage;
  const clashes = cells.map((a, i) =>
    cells.slice(0, i).flatMap((b, j) => (a % size === b % size || Math.floor(a / size) === Math.floor(b / size) ? [j] : [])),
  );
  const out: number[][] = [];
  const tuple: number[] = [];
  const grow = (i: number, sum: number, product: number): void => {
    if (i === cells.length) {
      if (cageHolds(operation, target, tuple)) out.push(tuple.slice());
      return;
    }
    for (let v = 1; v <= size; v++) {
      if (clashes[i].some(j => tuple[j] === v)) continue;
      // A sum or product past the target cannot come back down.
      if (operation === '+' && sum + v > target) break;
      if (operation === '×' && target % (product * v) !== 0) continue;
      tuple.push(v);
      grow(i + 1, sum + v, product * v);
      tuple.pop();
    }
  };
  grow(0, 0, 1);
  return out;
}

/** Columns: one per cell, one per row-digit, one per column-digit, each a block of size * size. */
const BLOCKS = { cell: 0, rowValue: 1, columnValue: 2, kinds: 3 } as const;

function latinColumns(size: number, cell: number, value: number): number[] {
  const area = size * size;
  const row = Math.floor(cell / size);
  const column = cell % size;
  return [
    BLOCKS.cell * area + cell,
    BLOCKS.rowValue * area + row * size + value - 1,
    BLOCKS.columnValue * area + column * size + value - 1,
  ];
}

/** The exact-cover problem of a puzzle: one row per cage and digit tuple. */
function cageProblem(size: number, cages: readonly CalcudokuCage[]): { problem: ExactCoverProblem; owners: [number, number[]][] } {
  const rows: number[][] = [];
  const owners: [number, number[]][] = [];
  cages.forEach((cage, k) => {
    for (const tuple of cageTuples(size, cage)) {
      rows.push(cage.cells.flatMap((cell, i) => latinColumns(size, cell, tuple[i])));
      owners.push([k, tuple]);
    }
  });
  return { problem: { columns: BLOCKS.kinds * size * size, rows }, owners };
}

/** Solutions of the cages, counted up to `limit`: 0 none, 1 unique, 2 or more. */
export function countCalcudokuSolutions(size: number, cages: readonly CalcudokuCage[], limit = 2): number {
  return searchExactCover(cageProblem(size, cages).problem, limit).count;
}

/** The first solution the counter finds, row by row, or null when the cages have none. */
export function solveCalcudoku(size: number, cages: readonly CalcudokuCage[]): number[] | null {
  const { problem, owners } = cageProblem(size, cages);
  const found = searchExactCover(problem, 1).first;
  if (!found) return null;
  const out = new Array<number>(size * size).fill(0);
  for (const row of found) {
    const [k, tuple] = owners[row];
    cages[k].cells.forEach((cell, i) => (out[cell] = tuple[i]));
  }
  return out;
}

const bit = (value: number): number => 1 << (value - 1);
const isSingle = (mask: number): boolean => mask !== 0 && (mask & (mask - 1)) === 0;
const valueOf = (mask: number): number => Math.round(Math.log2(mask)) + 1;

/**
 * Plain deduction: the solution when it finishes the puzzle, else null. Each round keeps the cage
 * tuples the cells' candidates still allow, narrows the cells to them, then places the naked and
 * hidden singles of each row and column. Every step is forced, so a finish proves one solution.
 */
export function deduceCalcudoku(size: number, cages: readonly CalcudokuCage[]): number[] | null {
  const full = (1 << size) - 1;
  const candidates = new Array<number>(size * size).fill(full);
  let tuples = cages.map(cage => cageTuples(size, cage));
  const units: number[][] = [];
  for (let i = 0; i < size; i++) {
    units.push(Array.from({ length: size }, (_, c) => i * size + c));
    units.push(Array.from({ length: size }, (_, r) => r * size + i));
  }
  let changed = true;
  while (changed) {
    changed = false;
    tuples = tuples.map((list, k) => {
      const { cells } = cages[k];
      const kept = list.filter(tuple => tuple.every((v, i) => (candidates[cells[i]] & bit(v)) !== 0));
      cells.forEach((cell, i) => {
        const allowed = kept.reduce((mask, tuple) => mask | bit(tuple[i]), 0);
        if ((candidates[cell] & allowed) !== candidates[cell]) {
          candidates[cell] &= allowed;
          changed = true;
        }
      });
      return kept;
    });
    for (const unit of units) {
      for (const cell of unit) {
        if (!isSingle(candidates[cell])) continue;
        for (const other of unit) {
          if (other !== cell && candidates[other] & candidates[cell]) {
            candidates[other] &= ~candidates[cell];
            changed = true;
          }
        }
      }
      for (let v = 1; v <= size; v++) {
        const holders = unit.filter(cell => candidates[cell] & bit(v));
        if (holders.length === 1 && candidates[holders[0]] !== bit(v)) {
          candidates[holders[0]] = bit(v);
          changed = true;
        }
      }
    }
    if (candidates.some(mask => mask === 0)) return null;
  }
  return candidates.every(isSingle) ? candidates.map(valueOf) : null;
}

/** A Latin square drawn from the seed: the first cover of the shuffled cell-digit choices. */
function latinSquare(size: number, random: Random): number[] {
  const choices: [number, number][] = [];
  for (let cell = 0; cell < size * size; cell++) for (let v = 1; v <= size; v++) choices.push([cell, v]);
  random.shuffle(choices);
  const problem = { columns: BLOCKS.kinds * size * size, rows: choices.map(([cell, v]) => latinColumns(size, cell, v)) };
  const found = searchExactCover(problem, 1).first;
  if (!found) throw new Error(`no ${size} x ${size} Latin square`); // cannot happen: one always exists
  const out = new Array<number>(size * size).fill(0);
  for (const row of found) out[choices[row][0]] = choices[row][1];
  return out;
}

/** A cage size drawn with the band's weights. */
function drawCageSize(random: Random, weights: readonly number[]): number {
  let pick = random.int(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i];
    if (pick < 0) return i + 1;
  }
  return weights.length;
}

function neighbours(size: number, cell: number): number[] {
  const row = Math.floor(cell / size);
  const column = cell % size;
  const out: number[] = [];
  if (row > 0) out.push(cell - size);
  if (column > 0) out.push(cell - 1);
  if (column < size - 1) out.push(cell + 1);
  if (row < size - 1) out.push(cell + size);
  return out;
}

/**
 * The grid cut into connected cages: each grows from a free cell to its drawn size through free
 * neighbours. A cage left smaller than the band allows joins a neighbouring cage.
 */
function cutCages(size: number, random: Random, weights: readonly number[]): number[][] {
  const owner = new Array<number>(size * size).fill(-1);
  const cages: number[][] = [];
  for (const start of random.shuffle(owner.map((_, i) => i))) {
    if (owner[start] >= 0) continue;
    const k = cages.length;
    const cage = [start];
    owner[start] = k;
    const want = drawCageSize(random, weights);
    while (cage.length < want) {
      const free = cage.flatMap(cell => neighbours(size, cell)).filter(cell => owner[cell] < 0);
      if (free.length === 0) break;
      const next = random.pick(free);
      owner[next] = k;
      cage.push(next);
    }
    cages.push(cage);
  }
  const smallest = weights.findIndex(w => w > 0) + 1;
  cages.forEach((cage, k) => {
    if (cage.length >= smallest) return;
    const near = [...new Set(cage.flatMap(cell => neighbours(size, cell)).map(cell => owner[cell]).filter(o => o !== k))];
    const into = random.pick(near);
    for (const cell of cage) owner[cell] = into;
    cages[into].push(...cage);
    cages[k] = [];
  });
  return cages.filter(cage => cage.length > 0).map(cage => cage.sort((a, b) => a - b));
}

/** The operation and target a cage takes from its solution digits, drawn among the band's. */
function labelCage(cells: number[], solution: readonly number[], random: Random, operations: readonly CalcudokuOperation[]): CalcudokuCage {
  const values = cells.map(cell => solution[cell]);
  if (values.length === 1) return { cells, operation: '=', target: values[0] };
  const sum = values.reduce((a, b) => a + b, 0);
  const product = values.reduce((a, b) => a * b, 1);
  if (values.length === PAIR && random.chance(PAIR_DIFFERENCE_CHANCE)) {
    const [high, low] = values[0] >= values[1] ? values : [values[1], values[0]];
    if (operations.includes('/') && high % low === 0 && random.int(PAIR) === 0) return { cells, operation: '/', target: high / low };
    if (operations.includes('-')) return { cells, operation: '-', target: high - low };
  }
  if (operations.includes('×') && random.chance(PRODUCT_CHANCE)) return { cells, operation: '×', target: product };
  return { cells, operation: '+', target: sum };
}

function attempt(size: number, seed: string, rule: BandRule): { cages: CalcudokuCage[]; solution: number[] } | null {
  const random = createRandom(seed);
  const solution = latinSquare(size, random);
  const cages = cutCages(size, random, rule.sizeWeights).map(cells => labelCage(cells, solution, random, rule.operations));
  const deduced = deduceCalcudoku(size, cages);
  if (rule.deducible) return deduced ? { cages, solution } : null;
  return !deduced && countCalcudokuSolutions(size, cages) === 1 ? { cages, solution } : null;
}

/**
 * A calcudoku of the given side and band from the seed: the same three arguments always give the
 * same puzzle, with exactly one solution. Throws on a side not offered, or when no attempt meets
 * the band.
 */
export function generateCalcudoku(seed: string, size: number, difficulty: Difficulty): Calcudoku {
  requireOffered(size, difficulty);
  const rule = BAND_RULES[difficulty];
  for (let i = 0; i < CALCUDOKU_ATTEMPTS; i++) {
    const made = attempt(size, childSeed(seed, i), rule);
    if (made) return { id: { game: 'calcudoku', size: sizeToken(size), difficulty, seed }, size, ...made };
  }
  throw new Error(`no ${difficulty} ${size} x ${size} calcudoku from seed «${seed}» in ${CALCUDOKU_ATTEMPTS} attempts`);
}
