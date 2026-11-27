/**
 * Kakuro (#389): a crossword of digits. Each run of white cells across or down holds distinct
 * digits 1 to 9 that add up to the clue in the block before it. A puzzle is a block layout drawn
 * from the seed, a digit fill, and the sums of that fill; it is kept only when the band's
 * techniques finish it, which proves one solution. The result is our own model; drawing it and
 * checking the ink are `kakuro-page.ts`'s job.
 *
 * shortcut: generated on the tablet, not from a bank as sudoku is: under `node --jitless` a
 * 12 x 12 hard takes about 1 s and 3 s at worst over the seeds tried; move it to a bank the way
 * `sudoku-bank.ts` does if the device round measures it slower than the player can wait.
 */

import { type Difficulty, type PuzzleId } from './code';
import { searchExactCover, type ExactCoverProblem } from './exact-cover';
import { childSeed, createRandom, type Random } from './random';

export type KakuroDirection = 'across' | 'down';

export interface KakuroRun {
  readonly direction: KakuroDirection;
  /** The block that holds the sum: left of an across run, above a down run. */
  readonly clue: number;
  /** The white cells of the run, in reading order. */
  readonly cells: readonly number[];
  readonly sum: number;
}

/** What the page shows: the grid, its blocks and the runs with their sums. */
export interface KakuroClues {
  /** The grid's side, the clue row and column included. */
  size: number;
  /** Row by row: true for a block, false for a cell the player fills. */
  blocks: boolean[];
  runs: KakuroRun[];
}

/** The hardest step the solver needed: run sums alone, sums against the other cells, or a trial. */
export type KakuroTechnique = 'combinations' | 'elimination' | 'trial';

export interface KakuroRating {
  difficulty: Difficulty;
  hardest: KakuroTechnique;
}

export interface Kakuro extends KakuroClues {
  id: PuzzleId;
  /** Row by row, 0 for a block. */
  solution: number[];
  rating: KakuroRating;
}

/**
 * The sizes offered (the side, the clue row and column included), with the bands each reaches:
 * a band is offered only where the attempts found it for every seed the tests try.
 */
export const KAKURO_SIZES: Readonly<Record<number, readonly Difficulty[]>> = {
  6: ['easy', 'medium', 'hard'],
  8: ['easy', 'medium', 'hard'],
  10: ['easy', 'medium', 'hard'],
  12: ['easy', 'medium', 'hard'],
};

const DIGITS = 9;
const DIGIT_LIST: readonly number[] = Array.from({ length: DIGITS }, (_, i) => i + 1);
/** A change is a new digit or a swap, and a swap runs across or down, each half the time. */
const EVEN_CHANCE = 50;
const ALL = (1 << DIGITS) - 1;
const MIN_RUN = 2;
/** A run holds distinct digits, so nine cells at most. */
const MAX_RUN = DIGITS;

/** The share of interior cells drawn as blocks, in percent: more blocks make shorter runs. */
const BLOCK_CHANCE: Readonly<Record<Difficulty, number>> = { easy: 28, medium: 25, hard: 22, expert: 22 };
/** How many seeded attempts a band gets before generation gives up with an error. */
const KAKURO_ATTEMPTS = 40;
/** How many one-digit changes an attempt tries on its fill before it draws a fresh layout. */
const SETTLE_STEPS = 1600;
/** The digit fill gives up after this many placements; a fresh layout is cheaper than a long search. */
const FILL_BUDGET = 25_000;

const BAND_OF: Readonly<Record<KakuroTechnique, Difficulty>> = { combinations: 'easy', elimination: 'medium', trial: 'hard' };
const TECHNIQUE_OF: Readonly<Record<Difficulty, KakuroTechnique>> = { easy: 'combinations', medium: 'elimination', hard: 'trial', expert: 'trial' };

const bit = (digit: number): number => 1 << (digit - 1);
const popcount = (mask: number): number => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
};
/** The digits in each mask, looked up: the solver's hot path. */
const POPCOUNT = Uint8Array.from({ length: ALL + 1 }, (_, mask) => popcount(mask));
const digitOf = (mask: number): number => {
  let d = 1;
  while (!(mask & 1)) {
    mask >>= 1;
    d++;
  }
  return d;
};

/** COMBOS[length][sum]: every set of `length` distinct digits that adds up to `sum`, as masks. */
const COMBOS: number[][][] = (() => {
  const table: number[][][] = Array.from({ length: DIGITS + 1 }, () => Array.from({ length: 46 }, () => [] as number[]));
  for (let mask = 1; mask <= ALL; mask++) {
    let sum = 0;
    for (let d = 1; d <= DIGITS; d++) if (mask & bit(d)) sum += d;
    table[popcount(mask)][sum].push(mask);
  }
  return table;
})();

/** The runs of a block layout: each block followed by two or more white cells across or down. */
export function kakuroRuns(size: number, blocks: readonly boolean[], solution?: readonly number[]): KakuroRun[] {
  const runs: KakuroRun[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const clue = r * size + c;
      if (!blocks[clue]) continue;
      for (const direction of ['across', 'down'] as const) {
        const cells: number[] = [];
        const step = direction === 'across' ? 1 : size;
        for (let k = 1; ; k++) {
          const [rr, cc] = direction === 'across' ? [r, c + k] : [r + k, c];
          if (rr >= size || cc >= size || blocks[rr * size + cc]) break;
          cells.push(clue + k * step);
        }
        if (cells.length === 0) continue;
        const sum = solution ? cells.reduce((total, cell) => total + solution[cell], 0) : 0;
        runs.push({ direction, clue, cells, sum });
      }
    }
  }
  return runs;
}

/** The white cells in pieces joined across their sides. */
function whitePieces(size: number, blocks: readonly boolean[]): number[][] {
  const seen = new Set<number>();
  const pieces: number[][] = [];
  blocks.forEach((block, first) => {
    if (block || seen.has(first)) return;
    const piece = [first];
    seen.add(first);
    for (let i = 0; i < piece.length; i++) {
      const [r, c] = [Math.floor(piece[i] / size), piece[i] % size];
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        const next = rr * size + cc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size || blocks[next] || seen.has(next)) continue;
        seen.add(next);
        piece.push(next);
      }
    }
    pieces.push(piece);
  });
  return pieces;
}

/**
 * A block layout with the clue row and column, symmetric under a half turn of the interior, as
 * printed kakuros are. It starts all white and adds blocks in pairs, in a seeded order, each pair
 * kept only when every run still has two cells or more and the white cells stay one piece, until
 * `chance` percent of the interior is blocks; then it splits each run past nine cells the same
 * way. Null when a long run cannot be split.
 */
function drawLayout(random: Random, size: number, chance: number): boolean[] | null {
  const blocks = new Array<boolean>(size * size).fill(false);
  for (let i = 0; i < size; i++) {
    blocks[i] = true;
    blocks[i * size] = true;
  }
  const partner = (cell: number): number => (size - Math.floor(cell / size)) * size + (size - (cell % size));
  const keeps = (): boolean =>
    kakuroRuns(size, blocks).every(run => run.cells.length >= MIN_RUN) && whitePieces(size, blocks).length === 1;
  let count = 0;
  const tryBlock = (cell: number): boolean => {
    if (blocks[cell]) return false;
    const pair = partner(cell);
    blocks[cell] = blocks[pair] = true;
    if (keeps()) {
      count += cell === pair ? 1 : 2;
      return true;
    }
    blocks[cell] = blocks[pair] = false;
    return false;
  };
  const target = Math.round(((size - 1) * (size - 1) * chance) / 100);
  const interior: number[] = [];
  for (let r = 1; r < size; r++) for (let c = 1; c < size; c++) if (r * size + c <= partner(r * size + c)) interior.push(r * size + c);
  for (const cell of random.shuffle(interior)) {
    if (count >= target) break;
    tryBlock(cell);
  }
  for (;;) {
    const long = kakuroRuns(size, blocks).find(run => run.cells.length > MAX_RUN);
    if (!long) return blocks;
    if (!random.shuffle(long.cells.slice()).some(tryBlock)) return null;
  }
}

/** The two runs through each white cell, by index into `runs`. */
function runsOfCells(clues: KakuroClues): Map<number, [across: number, down: number]> {
  const of = new Map<number, [number, number]>();
  clues.runs.forEach((run, i) => {
    for (const cell of run.cells) {
      const pair = of.get(cell) ?? [-1, -1];
      pair[run.direction === 'across' ? 0 : 1] = i;
      of.set(cell, pair);
    }
  });
  return of;
}

/** A seeded digit fill with no digit twice in a run, or null past the budget. */
function fillDigits(random: Random, clues: KakuroClues): number[] | null {
  const cells = clues.blocks.flatMap((block, cell) => (block ? [] : [cell]));
  const of = runsOfCells(clues);
  const used = new Array<number>(clues.runs.length).fill(0);
  const values = new Array<number>(clues.size * clues.size).fill(0);
  let budget = FILL_BUDGET;
  const place = (i: number): boolean => {
    if (i === cells.length) return true;
    const cell = cells[i];
    const [a, d] = of.get(cell) as [number, number];
    for (const digit of random.shuffle(DIGIT_LIST.slice())) {
      if ((used[a] | used[d]) & bit(digit)) continue;
      if (--budget < 0) return false;
      used[a] |= bit(digit);
      used[d] |= bit(digit);
      values[cell] = digit;
      if (place(i + 1)) return true;
      used[a] &= ~bit(digit);
      used[d] &= ~bit(digit);
      values[cell] = 0;
    }
    return false;
  };
  return place(0) ? values : null;
}

/** The solver's state: each white cell's candidate digits as a mask; a block stays 0. */
type Candidates = Uint16Array;
type Level = 'combinations' | 'elimination';

/** The solver's view of the clues: the two runs through each cell, at `2 * cell` and `2 * cell + 1`. */
interface Solver {
  readonly clues: KakuroClues;
  readonly runsOf: Int32Array;
}

function solverOf(clues: KakuroClues): Solver {
  const runsOf = new Int32Array(2 * clues.size * clues.size).fill(-1);
  clues.runs.forEach((run, i) => {
    for (const cell of run.cells) runsOf[2 * cell + (run.direction === 'across' ? 0 : 1)] = i;
  });
  return { clues, runsOf };
}

/**
 * Narrows the candidates run by run until nothing changes; false on a contradiction. Only the
 * runs in `start` are read first (every run when absent), then the runs of each changed cell.
 *
 * - `combinations` reads a run's sum and the digits already placed in it: a cell keeps only the
 *   digits of a combination that holds every placed digit.
 * - `elimination` also drops a combination that the other cells' candidates cannot hold, and
 *   places a digit every combination needs where only one cell of the run can take it.
 */
function narrow(solver: Solver, cand: Candidates, level: Level, start?: readonly number[]): boolean {
  const { runs } = solver.clues;
  const queue: number[] = start ? [...start] : runs.map((_, i) => i);
  const queued = new Uint8Array(runs.length);
  for (const i of queue) queued[i] = 1;
  const set = (cell: number, mask: number): void => {
    cand[cell] = mask;
    for (const k of [solver.runsOf[2 * cell], solver.runsOf[2 * cell + 1]]) {
      if (!queued[k]) {
        queued[k] = 1;
        queue.push(k);
      }
    }
  };
  while (queue.length) {
    const index = queue.pop() as number;
    queued[index] = 0;
    const run = runs[index];
    let placed = 0;
    let open = 0;
    for (const cell of run.cells) {
      const mask = cand[cell];
      if (mask === 0) return false;
      if (POPCOUNT[mask] === 1) {
        if (placed & mask) return false;
        placed |= mask;
      } else open |= mask;
    }
    let union = 0;
    let needed = ALL;
    for (const combo of COMBOS[run.cells.length][run.sum] ?? []) {
      if (placed & ~combo) continue;
      if (level === 'elimination') {
        const rest = combo & ~placed;
        if (rest & ~open) continue;
        if (run.cells.some(cell => POPCOUNT[cand[cell]] > 1 && !(cand[cell] & rest))) continue;
      }
      union |= combo;
      needed &= combo;
    }
    if (union === 0) return false;
    for (const cell of run.cells) {
      const mask = cand[cell];
      if (POPCOUNT[mask] === 1) continue;
      const next = mask & union & ~placed;
      if (next === 0) return false;
      if (next !== mask) set(cell, next);
    }
    if (level !== 'elimination') continue;
    for (let rest = needed & ~placed; rest; rest &= rest - 1) {
      const digit = rest & -rest;
      let taker = -1;
      let takers = 0;
      for (const cell of run.cells) {
        if (cand[cell] & digit) {
          taker = cell;
          takers++;
        }
      }
      if (takers === 0) return false;
      if (takers === 1 && cand[taker] !== digit) set(taker, digit);
    }
  }
  return true;
}

const solved = (clues: KakuroClues, cand: Candidates): boolean => clues.blocks.every((block, cell) => block || POPCOUNT[cand[cell]] === 1);

/**
 * One trial per open candidate: a digit whose placement narrows to a contradiction is dropped.
 * Repeats until the grid is solved or no trial drops a digit; false on a contradiction. The
 * candidates are narrowed already, so a trial reads only the runs of its cell first.
 */
function trials(solver: Solver, cand: Candidates): boolean {
  const { clues } = solver;
  for (let dropped = true; dropped && !solved(clues, cand); ) {
    dropped = false;
    for (let cell = 0; cell < cand.length; cell++) {
      if (clues.blocks[cell] || POPCOUNT[cand[cell]] === 1) continue;
      const touched = [solver.runsOf[2 * cell], solver.runsOf[2 * cell + 1]];
      for (let rest = cand[cell]; rest; rest &= rest - 1) {
        const digit = rest & -rest;
        const trial = cand.slice();
        trial[cell] = digit;
        if (narrow(solver, trial, 'elimination', touched)) continue;
        cand[cell] &= ~digit;
        dropped = true;
        if (!narrow(solver, cand, 'elimination', touched)) return false;
      }
    }
  }
  return true;
}

function startCandidates(clues: KakuroClues): Candidates {
  const cand = new Uint16Array(clues.size * clues.size);
  clues.blocks.forEach((block, cell) => {
    if (!block) cand[cell] = ALL;
  });
  return cand;
}

/** The candidates as digits, row by row, 0 for a block. */
const digitsOf = (clues: KakuroClues, cand: Candidates): number[] => [...cand].map((mask, cell) => (clues.blocks[cell] ? 0 : digitOf(mask)));

const TECHNIQUES: readonly KakuroTechnique[] = ['combinations', 'elimination', 'trial'];

/**
 * Narrows the candidates with each technique up to `upTo`, easiest first. Answers the candidates
 * left and the hardest technique used, or null when they leave a cell open or find a contradiction.
 */
function deduce(clues: KakuroClues, upTo: KakuroTechnique): { cand: Candidates; hardest: KakuroTechnique | null } {
  const cand = startCandidates(clues);
  const solver = solverOf(clues);
  for (const technique of TECHNIQUES) {
    const ok = technique === 'trial' ? trials(solver, cand) : narrow(solver, cand, technique);
    if (!ok) return { cand, hardest: null };
    if (solved(clues, cand)) return { cand, hardest: technique };
    if (technique === upTo) break;
  }
  return { cand, hardest: null };
}

/**
 * The puzzle's rating and its solution: the easiest technique set that finishes it, or null when
 * even trials do not. A grid these techniques finish has exactly one solution, since each step
 * only drops digits no solution can hold.
 */
export function rateKakuro(clues: KakuroClues): { rating: KakuroRating; solution: number[] } | null {
  const { cand, hardest } = deduce(clues, 'trial');
  if (!hardest) return null;
  return { rating: { difficulty: BAND_OF[hardest], hardest }, solution: digitsOf(clues, cand) };
}

/**
 * The puzzle as exact cover, for the shared counter. Columns: each white cell once; each run once,
 * by one combination of its sum; and each run and digit once. A cell row covers its cell and the
 * digit in both its runs; a combination row covers its run and every digit the combination leaves
 * out, so the run's cells must hold exactly the combination's digits.
 */
function kakuroProblem(clues: KakuroClues): { problem: ExactCoverProblem; cellRows: [cell: number, digit: number][] } {
  const cells = clues.blocks.flatMap((block, cell) => (block ? [] : [cell]));
  const of = runsOfCells(clues);
  const runBase = cells.length;
  const digitBase = runBase + clues.runs.length;
  const digitColumn = (run: number, digit: number): number => digitBase + run * DIGITS + digit - 1;
  const rows: number[][] = [];
  const cellRows: [number, number][] = [];
  cells.forEach((cell, i) => {
    const [a, d] = of.get(cell) as [number, number];
    for (let digit = 1; digit <= DIGITS; digit++) {
      rows.push([i, digitColumn(a, digit), digitColumn(d, digit)]);
      cellRows.push([cell, digit]);
    }
  });
  clues.runs.forEach((run, r) => {
    for (const combo of COMBOS[run.cells.length][run.sum] ?? []) {
      const row = [runBase + r];
      for (let digit = 1; digit <= DIGITS; digit++) if (!(combo & bit(digit))) row.push(digitColumn(r, digit));
      rows.push(row);
    }
  });
  return { problem: { columns: digitBase + clues.runs.length * DIGITS, rows }, cellRows };
}

/** Solutions of the clues, counted by the shared exact-cover counter up to `limit`: 0, 1, or 2 and more. */
export function countKakuroSolutions(clues: KakuroClues, limit = 2): number {
  return searchExactCover(kakuroProblem(clues).problem, limit).count;
}

/** One solution of the clues, row by row with 0 for a block, or null when it has none. */
export function solveKakuro(clues: KakuroClues): number[] | null {
  const { problem, cellRows } = kakuroProblem(clues);
  const found = searchExactCover(problem, 1).first;
  if (!found) return null;
  const out = new Array<number>(clues.size * clues.size).fill(0);
  for (const row of found) if (row < cellRows.length) out[cellRows[row][0]] = cellRows[row][1];
  return out;
}

function offeredBands(size: number, difficulty: Difficulty): void {
  const bands = KAKURO_SIZES[size];
  if (!bands) throw new RangeError(`kakuro size ${size} is not offered: ${Object.keys(KAKURO_SIZES).join(', ')}`);
  if (!bands.includes(difficulty)) throw new RangeError(`a ${size} x ${size} kakuro offers ${bands.join(', ')}, not ${difficulty}`);
}

/** The clues a fill gives: its layout's runs with their sums. */
const cluesOf = (size: number, blocks: boolean[], fill: readonly number[]): KakuroClues => ({ size, blocks, runs: kakuroRuns(size, blocks, fill) });

interface Open {
  cells: number[];
  extra: number;
  hardest: KakuroTechnique | null;
}

/**
 * What the techniques up to `upTo` leave: the open white cells, and how many candidates they
 * still hold past one each, which falls by steps even while every cell stays open.
 */
function leftOpen(clues: KakuroClues, upTo: KakuroTechnique): Open {
  const { cand, hardest } = deduce(clues, upTo);
  const cells: number[] = [];
  let extra = 0;
  clues.blocks.forEach((block, cell) => {
    const count = POPCOUNT[cand[cell]];
    if (block || count === 1) return;
    cells.push(cell);
    extra += count - 1;
  });
  return { cells, extra, hardest };
}

/**
 * One change of the fill at an open cell, or null when none keeps every run distinct: the cell
 * takes a digit neither of its runs holds, or swaps digits with another cell of one of its runs.
 * A swap keeps that run's sum; it is the only change left in a long run whose digits are all taken.
 */
function move(random: Random, runs: readonly KakuroRun[], of: Map<number, [number, number]>, fill: readonly number[], cell: number): number[] | null {
  const runsOf = (c: number): readonly KakuroRun[] => (of.get(c) as [number, number]).map(i => runs[i]);
  const holds = (run: KakuroRun, digit: number, except: number): boolean => run.cells.some(c => c !== except && fill[c] === digit);
  const next = fill.slice();
  if (random.chance(EVEN_CHANCE)) {
    const options = DIGIT_LIST.filter(digit => digit !== fill[cell] && runsOf(cell).every(run => !holds(run, digit, cell)));
    if (options.length === 0) return null;
    next[cell] = random.pick(options);
    return next;
  }
  const [across, down] = runsOf(cell);
  const along = random.chance(EVEN_CHANCE) ? across : down;
  const other = random.pick(along.cells.filter(c => c !== cell));
  // Each cell's other run must not already hold the digit it takes.
  const cross = (c: number): KakuroRun => runsOf(c)[along === across ? 1 : 0];
  if (holds(cross(cell), fill[other], cell) || holds(cross(other), fill[cell], other)) return null;
  next[cell] = fill[other];
  next[other] = fill[cell];
  return next;
}

/** A hard fill is settled against elimination until this many open cells or fewer, then against trials. */
const TRIAL_OPEN = 12;
/** How many changes the trial phase tries: a fill trials do not finish soon rarely ends well, and trials are slow. */
const TRIAL_STEPS = 175;

/**
 * Changes the fill one digit at a time until the techniques up to `upTo` leave at most `until`
 * open cells: an open cell takes another digit its runs allow, or swaps with a cell of its run,
 * and the change is kept when no more candidates stay and `keep` accepts what is left. A random
 * fill almost never has one solution, and a change moves two sums only, so this converges. Null
 * when it does not within the steps.
 */
function settle(
  random: Random,
  size: number,
  blocks: boolean[],
  start: number[],
  upTo: KakuroTechnique,
  until: number,
  keep: (open: Open) => boolean,
  steps: number,
): number[] | null {
  const runs = kakuroRuns(size, blocks);
  const of = runsOfCells({ size, blocks, runs });
  let fill = start;
  let open = leftOpen(cluesOf(size, blocks, fill), upTo);
  for (let step = 0; step < steps; step++) {
    if (open.cells.length <= until) return fill;
    const next = move(random, runs, of, fill, random.pick(open.cells));
    if (!next) continue;
    const nextOpen = leftOpen(cluesOf(size, blocks, next), upTo);
    if (nextOpen.extra <= open.extra && keep(nextOpen)) {
      fill = next;
      open = nextOpen;
    }
  }
  return null;
}

/**
 * A fill the band's techniques finish. Trials are slow, so a hard fill is first settled against
 * elimination, never down to no open cell, and then against trials, which must still be needed.
 */
function settleFor(random: Random, size: number, blocks: boolean[], start: number[], difficulty: Difficulty): number[] | null {
  const technique = TECHNIQUE_OF[difficulty];
  if (technique !== 'trial') return settle(random, size, blocks, start, technique, 0, () => true, SETTLE_STEPS);
  const near = settle(random, size, blocks, start, 'elimination', TRIAL_OPEN, open => open.cells.length > 0, SETTLE_STEPS);
  return near && settle(random, size, blocks, near, 'trial', 0, open => open.hardest !== 'combinations' && open.hardest !== 'elimination', TRIAL_STEPS);
}

/**
 * A kakuro of the given side and band from the seed: the same three arguments always give the
 * same puzzle. Each attempt draws a layout and a fill, settles the fill until the band's
 * techniques finish its sums, and keeps it when no easier techniques do. Throws on a size not
 * offered or a band it cannot reach.
 */
export function generateKakuro(seed: string, size: number, difficulty: Difficulty): Kakuro {
  offeredBands(size, difficulty);
  for (let i = 0; i < KAKURO_ATTEMPTS; i++) {
    const random = createRandom(childSeed(seed, i));
    const blocks = drawLayout(random, size, BLOCK_CHANCE[difficulty]);
    if (!blocks) continue;
    const start = fillDigits(random, { size, blocks, runs: kakuroRuns(size, blocks) });
    if (!start) continue;
    const fill = settleFor(random, size, blocks, start, difficulty);
    if (!fill) continue;
    const clues = cluesOf(size, blocks, fill);
    const rated = rateKakuro(clues);
    if (!rated || rated.rating.difficulty !== difficulty) continue;
    if (rated.solution.some((digit, cell) => digit !== fill[cell])) {
      throw new Error(`kakuro seed «${seed}» attempt ${i}: the solver found another solution than the fill`); // cannot happen: every step is sound
    }
    return { id: { game: 'kakuro', size: String(size), difficulty, seed }, ...clues, solution: fill, rating: rated.rating };
  }
  throw new Error(`no ${difficulty} ${size} x ${size} kakuro from seed «${seed}» in ${KAKURO_ATTEMPTS} attempts`);
}
