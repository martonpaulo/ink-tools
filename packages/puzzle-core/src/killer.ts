/**
 * Killer sudoku, 9 x 9 (#387): a sudoku whose cages each show the sum of their digits, with no
 * digit twice in a cage. The full grid comes from the sudoku bank, the cages grow from the seed
 * over it, and a solver counts the solutions: candidates per cell, singles, and each cage kept to
 * the digit sets of its size and sum. (Exact cover, the sudoku counter, has no way to carry a sum
 * forward, and proving one solution took it seconds.) Where a second solution exists, a cell where
 * it differs becomes a printed given, up to the band's limit, else the next attempt starts. Tatham's Solo
 * (MIT) builds its killer mode the same way, cages first and a uniqueness check after; no code is
 * taken from it. As with the sudoku, digging runs on the Mac into a bank, and a game shows a bank
 * entry another way. Drawing the page and checking the ink are `killer-page.ts`'s job.
 */

import { type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';
import { KILLER_BANK } from './killer-bank';
import { generateSudoku } from './sudoku';
import { type SudokuShape } from './sudoku-techniques';

export const KILLER_SHAPE: SudokuShape = { size: 9, boxRows: 3, boxCols: 3 };

export interface KillerCage {
  /** Cell indices, row by row, in ascending order. */
  cells: number[];
  sum: number;
}

/**
 * What each band allows. shortcut: the band is set by cage sizes and givens, not by a rating of
 * the human techniques a killer needs (cage sums, the rule of 45); upgrade when a killer technique
 * solver lands beside the sudoku one.
 */
export const KILLER_BANDS: Readonly<Record<Difficulty, { minCage: number; maxCage: number; maxGivens: number }>> = {
  easy: { minCage: 1, maxCage: 3, maxGivens: 6 },
  medium: { minCage: 2, maxCage: 4, maxGivens: 3 },
  hard: { minCage: 2, maxCage: 4, maxGivens: 0 },
  expert: { minCage: 2, maxCage: 5, maxGivens: 0 },
};

export interface KillerRating {
  difficulty: Difficulty;
  cages: number;
  largestCage: number;
  givens: number;
}

export interface KillerSudoku {
  id: PuzzleId;
  shape: SudokuShape;
  cages: KillerCage[];
  /** Row by row, 0 for an empty cell; most killers have none. */
  givens: number[];
  solution: number[];
  rating: KillerRating;
}

const N = KILLER_SHAPE.size;
const AREA = N * N;
/** How many seeded attempts a band gets before generation gives up with an error. */
const KILLER_ATTEMPTS = 450;

/** Bit v stands for digit v; FULL holds 1 to 9. */
const FULL = ((1 << N) - 1) << 1;

const bitCount = (mask: number): number => {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
};

/** The rows, columns and boxes as lists of cells. */
const UNITS: readonly number[][] = (() => {
  const units: number[][] = [];
  for (let i = 0; i < N; i++) {
    units.push(Array.from({ length: N }, (_, k) => i * N + k));
    units.push(Array.from({ length: N }, (_, k) => k * N + i));
    const top = Math.floor(i / KILLER_SHAPE.boxRows) * KILLER_SHAPE.boxRows;
    const left = (i % (N / KILLER_SHAPE.boxCols)) * KILLER_SHAPE.boxCols;
    units.push(Array.from({ length: N }, (_, k) => (top + Math.floor(k / KILLER_SHAPE.boxCols)) * N + left + (k % KILLER_SHAPE.boxCols)));
  }
  return units;
})();

/** The digit sets of `size` distinct digits that add up to `sum`, as masks of bit v for digit v. */
function cageCombinations(size: number, sum: number): number[] {
  const out: number[] = [];
  for (let mask = FULL; mask > 0; mask = (mask - 2) & FULL) {
    let total = 0;
    for (let v = 1; v <= N; v++) if (mask & (1 << v)) total += v;
    if (bitCount(mask) === size && total === sum) out.push(mask);
  }
  return out;
}

/**
 * What the solver needs of one puzzle: each cell's peers (row, column, box and cage), and the
 * groups of distinct digits with a known sum, with their digit sets. The groups are the cages and,
 * for each row, column and box, the cells outside the cages it holds whole: they add up to 45
 * less those cages (the rule of 45), which cuts the search a hundredfold.
 */
interface KillerModel {
  peers: readonly number[][];
  groups: readonly KillerCage[];
  combinations: readonly number[][];
}

/** A row, column or box holds 1 to 9 once, so its cells add up to 45. */
const UNIT_SUM = (N * (N + 1)) / 2;

function innerGroups(cages: readonly KillerCage[]): KillerCage[] {
  const groups: KillerCage[] = [];
  for (const unit of UNITS) {
    const inUnit = new Set(unit);
    const whole = cages.filter(cage => cage.cells.every(cell => inUnit.has(cell)));
    const covered = new Set(whole.flatMap(cage => cage.cells));
    const rest = unit.filter(cell => !covered.has(cell));
    if (rest.length > 0 && rest.length < N) {
      groups.push({ cells: rest, sum: UNIT_SUM - whole.reduce((total, cage) => total + cage.sum, 0) });
    }
  }
  return groups;
}

function killerModel(cages: readonly KillerCage[]): KillerModel {
  const peerSets = Array.from({ length: AREA }, () => new Set<number>());
  for (const group of [...UNITS, ...cages.map(cage => cage.cells)]) {
    for (const a of group) for (const b of group) if (a !== b) peerSets[a].add(b);
  }
  const groups = [...cages, ...innerGroups(cages)];
  return {
    peers: peerSets.map(set => [...set]),
    groups,
    combinations: groups.map(group => cageCombinations(group.cells.length, group.sum)),
  };
}

/** Candidates per cell (a mask) and placed digits (0 for none). */
interface State {
  candidates: Uint16Array;
  values: Uint8Array;
}

/** Places v at the cell and removes it from every peer; false on a contradiction. */
function place(model: KillerModel, state: State, cell: number, v: number): boolean {
  const bit = 1 << v;
  if (!(state.candidates[cell] & bit)) return false;
  state.values[cell] = v;
  state.candidates[cell] = bit;
  for (const peer of model.peers[cell]) {
    if (state.values[peer] === v) return false;
    if (state.candidates[peer] & bit) {
      state.candidates[peer] &= ~bit;
      if (state.candidates[peer] === 0) return false;
    }
  }
  return true;
}

/** Keeps a group's cells to the digits of the sets still possible; false on a contradiction. */
function narrowGroup(model: KillerModel, state: State, index: number): boolean | 'changed' {
  const { cells } = model.groups[index];
  let placed = 0;
  let open = 0;
  for (const cell of cells) {
    if (state.values[cell]) placed |= 1 << state.values[cell];
    else open |= state.candidates[cell];
  }
  let allowed = 0;
  let required = FULL;
  for (const set of model.combinations[index]) {
    // A set must hold the placed digits, give every open cell a digit and every missing digit a cell.
    if ((set & placed) !== placed || set & ~placed & ~open) continue;
    if (!cells.every(cell => state.values[cell] || state.candidates[cell] & set & ~placed)) continue;
    allowed |= set;
    required &= set;
  }
  if (allowed === 0) return false;
  let changed = false;
  for (const cell of cells) {
    if (state.values[cell]) continue;
    const next = state.candidates[cell] & allowed & ~placed;
    if (next === 0) return false;
    if (next !== state.candidates[cell]) {
      state.candidates[cell] = next;
      changed = true;
    }
  }
  // A digit every remaining set holds that only one cell can take goes there.
  for (let v = 1; v <= N; v++) {
    if (!(required & (1 << v)) || placed & (1 << v)) continue;
    const homes = cells.filter(cell => !state.values[cell] && state.candidates[cell] & (1 << v));
    if (homes.length === 0) return false;
    if (homes.length === 1) {
      if (!place(model, state, homes[0], v)) return false;
      changed = true;
    }
  }
  return changed ? 'changed' : true;
}

/** Singles and group sets until nothing changes; false on a contradiction. */
function propagate(model: KillerModel, state: State): boolean {
  for (let changed = true; changed; ) {
    changed = false;
    for (let cell = 0; cell < AREA; cell++) {
      const mask = state.candidates[cell];
      if (!state.values[cell] && bitCount(mask) === 1) {
        if (!place(model, state, cell, Math.log2(mask))) return false;
        changed = true;
      }
    }
    for (const unit of UNITS) {
      for (let v = 1; v <= N; v++) {
        let home = -1;
        let homes = 0;
        for (const cell of unit) {
          if (state.candidates[cell] & (1 << v)) {
            home = cell;
            homes++;
          }
        }
        if (homes === 0) return false;
        if (homes === 1 && !state.values[home]) {
          if (!place(model, state, home, v)) return false;
          changed = true;
        }
      }
    }
    for (let i = 0; i < model.groups.length; i++) {
      const narrowed = narrowGroup(model, state, i);
      if (!narrowed) return false;
      if (narrowed === 'changed') changed = true;
    }
  }
  return true;
}

/** Solutions of the cages and givens, up to `limit`, each as a full grid. */
function searchKiller(cages: readonly KillerCage[], givens: readonly number[], limit: number): { count: number; grids: number[][] } {
  const model = killerModel(cages);
  const grids: number[][] = [];
  const start: State = { candidates: new Uint16Array(AREA).fill(FULL), values: new Uint8Array(AREA) };
  let consistent = true;
  givens.forEach((v, cell) => {
    if (v > 0 && consistent) consistent = place(model, start, cell, v);
  });
  const search = (state: State): void => {
    if (!propagate(model, state)) return;
    // Branch on the open cell with the fewest candidates; none open is a solution.
    let best = -1;
    for (let cell = 0; cell < AREA; cell++) {
      if (!state.values[cell] && (best < 0 || bitCount(state.candidates[cell]) < bitCount(state.candidates[best]))) best = cell;
    }
    if (best < 0) {
      grids.push([...state.values]);
      return;
    }
    for (let v = 1; v <= N && grids.length < limit; v++) {
      if (!(state.candidates[best] & (1 << v))) continue;
      const next: State = { candidates: state.candidates.slice(), values: state.values.slice() };
      if (place(model, next, best, v)) search(next);
    }
  };
  if (consistent && limit > 0) search(start);
  return { count: grids.length, grids };
}

/** The cages and givens' solutions, counted up to `limit`: 0 none, 1 unique, 2 or more. */
export function countKillerSolutions(cages: readonly KillerCage[], givens: readonly number[], limit = 2): number {
  checkCages(cages);
  return searchKiller(cages, givens, limit).count;
}

/** The first solution of the cages and givens, or null when they have none. */
export function solveKiller(cages: readonly KillerCage[], givens: readonly number[]): number[] | null {
  checkCages(cages);
  return searchKiller(cages, givens, 1).grids[0] ?? null;
}

/** The cages must cover every cell exactly once. */
function checkCages(cages: readonly KillerCage[]): void {
  const seen = new Array<boolean>(AREA).fill(false);
  for (const cage of cages) {
    for (const cell of cage.cells) {
      if (cell < 0 || cell >= AREA || seen[cell]) throw new RangeError(`cell ${cell} is outside the grid or in two cages`);
      seen[cell] = true;
    }
  }
  if (seen.includes(false)) throw new RangeError('the cages leave a cell out');
}

function neighbours(cell: number): number[] {
  const r = Math.floor(cell / N);
  const c = cell % N;
  const out: number[] = [];
  if (r > 0) out.push(cell - N);
  if (c > 0) out.push(cell - 1);
  if (c < N - 1) out.push(cell + 1);
  if (r < N - 1) out.push(cell + N);
  return out;
}

/** Cages grown over the solution from seeded starts, each to a seeded size, never a digit twice. */
function growCages(solution: readonly number[], band: (typeof KILLER_BANDS)[Difficulty], random: Random): number[][] {
  const owner = new Array<number>(AREA).fill(-1);
  const cages: number[][] = [];
  for (const start of random.shuffle(Array.from({ length: AREA }, (_, i) => i))) {
    if (owner[start] >= 0) continue;
    const target = band.minCage + random.int(band.maxCage - band.minCage + 1);
    const cage = [start];
    let used = 1 << solution[start];
    owner[start] = cages.length;
    while (cage.length < target) {
      const frontier = [...new Set(cage.flatMap(neighbours))]
        .filter(cell => owner[cell] < 0 && !(used & (1 << solution[cell])))
        .sort((a, b) => a - b);
      if (frontier.length === 0) break;
      const next = random.pick(frontier);
      cage.push(next);
      used |= 1 << solution[next];
      owner[next] = cages.length;
    }
    cages.push(cage);
  }
  // A cage left smaller than the band's least joins a neighbouring cage that has room and no clash.
  for (let i = 0; i < cages.length; i++) {
    const cage = cages[i];
    if (cage.length === 0 || cage.length >= band.minCage) continue;
    const digitsOf = (list: number[]) => list.reduce((mask, cell) => mask | (1 << solution[cell]), 0);
    const mine = digitsOf(cage);
    const hosts = [...new Set(cage.flatMap(neighbours).map(cell => owner[cell]))]
      .filter(j => j !== i && cages[j].length + cage.length <= band.maxCage && !(digitsOf(cages[j]) & mine))
      .sort((a, b) => a - b);
    if (hosts.length === 0) continue;
    const host = random.pick(hosts);
    for (const cell of cage) owner[cell] = host;
    cages[host].push(...cage);
    cages[i] = [];
  }
  return cages.filter(cage => cage.length > 0).map(cage => cage.sort((a, b) => a - b));
}

function attempt(seed: string, difficulty: Difficulty): Omit<KillerSudoku, 'id' | 'shape'> | null {
  const band = KILLER_BANDS[difficulty];
  const solution = generateSudoku(childSeed(seed, 'grid'), N, 'easy').solution;
  const random = createRandom(childSeed(seed, 'cages'));
  const cages = growCages(solution, band, random)
    .map(cells => ({ cells, sum: cells.reduce((total, cell) => total + solution[cell], 0) }))
    .sort((a, b) => a.cells[0] - b.cells[0]);
  const givens = new Array<number>(AREA).fill(0);
  for (let given = 0; ; given++) {
    const { count, grids } = searchKiller(cages, givens, 2);
    if (count === 1) {
      const largestCage = Math.max(...cages.map(cage => cage.cells.length));
      return { cages, givens, solution, rating: { difficulty, cages: cages.length, largestCage, givens: given } };
    }
    if (given >= band.maxGivens) return null;
    // The other solution differs from ours somewhere; one such cell, printed, rules it out.
    const other = grids.find(grid => grid.some((v, i) => v !== solution[i]));
    if (!other) throw new Error('two solutions that agree everywhere'); // cannot happen: the solver finds distinct grids
    const cell = random.pick(other.map((v, i) => (v !== solution[i] ? i : -1)).filter(i => i >= 0));
    givens[cell] = solution[cell];
  }
}

/**
 * Makes a 9 x 9 killer sudoku of the band from the seed: cages grown over a full grid, attempt
 * after attempt until one has exactly one solution within the band's givens. The same arguments
 * always give the same puzzle. An expert one can take seconds, and the tablet runs about ten times
 * slower, so the plugin does not call it: `scripts/killer-bank.cjs` runs it on the Mac to write
 * the bank `generateKiller` reads, as the sudoku bank does.
 */
export function digKiller(seed: string, difficulty: Difficulty): KillerSudoku {
  if (!KILLER_BANDS[difficulty]) throw new RangeError(`a killer sudoku offers ${Object.keys(KILLER_BANDS).join(', ')}, not ${difficulty}`);
  for (let i = 0; i < KILLER_ATTEMPTS; i++) {
    const made = attempt(childSeed(seed, i), difficulty);
    if (made) return { id: { game: 'killer-sudoku', size: String(N), difficulty, seed }, shape: KILLER_SHAPE, ...made };
  }
  throw new Error(`no ${difficulty} killer sudoku from seed «${seed}» in ${KILLER_ATTEMPTS} attempts`);
}

/** A square turns onto itself in four quarter turns. */
const QUARTER_TURNS = 4;

/** A bank entry's cage ids: one character per cell, cages numbered by their first cell. */
const CAGE_IDS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT_RADIX = 10;

/**
 * A bank entry's text: the solution, each cell's cage id and the givens (0 for none), 81
 * characters each, row by row, joined by «/». The sums follow from the solution.
 */
export function encodeKiller(puzzle: Pick<KillerSudoku, 'cages' | 'givens' | 'solution'>): string {
  if (puzzle.cages.length > CAGE_IDS.length) throw new RangeError(`a bank entry holds at most ${CAGE_IDS.length} cages, not ${puzzle.cages.length}`);
  const ids = new Array<string>(AREA);
  puzzle.cages.forEach((cage, i) => cage.cells.forEach(cell => (ids[cell] = CAGE_IDS[i])));
  return [puzzle.solution.join(''), ids.join(''), puzzle.givens.join('')].join('/');
}

/** The cages, givens and solution of a bank entry's text. */
export function decodeKiller(text: string): Pick<KillerSudoku, 'cages' | 'givens' | 'solution'> {
  const [solutionText, idText, givenText] = text.split('/');
  if ([solutionText, idText, givenText].some(part => part?.length !== AREA)) throw new RangeError(`a bank entry is three parts of ${AREA} characters`);
  const solution = [...solutionText].map(ch => parseInt(ch, DIGIT_RADIX));
  return { solution, givens: [...givenText].map(ch => parseInt(ch, DIGIT_RADIX)), cages: cagesOf([...idText], solution) };
}

/** Cages from a per-cell key, ordered by their first cell, each summed over the solution. */
function cagesOf<K>(keys: readonly K[], solution: readonly number[]): KillerCage[] {
  const byKey = new Map<K, number[]>();
  keys.forEach((key, cell) => {
    const cells = byKey.get(key);
    if (cells) cells.push(cell);
    else byKey.set(key, [cell]);
  });
  return [...byKey.values()].map(cells => ({ cells, sum: cells.reduce((total, cell) => total + solution[cell], 0) }));
}

/**
 * The same puzzle seen another way: turned or mirrored (the square's eight symmetries keep every
 * cage connected and every box a box), and perhaps each digit v written as 10 - v, which turns a
 * cage of k cells and sum s into one of sum 10k - s. Each keeps the one solution and the band.
 */
function viewKiller(puzzle: Pick<KillerSudoku, 'cages' | 'givens' | 'solution'>, random: Random): Pick<KillerSudoku, 'cages' | 'givens' | 'solution'> {
  const turns = random.int(QUARTER_TURNS);
  const mirror = random.int(2) === 1;
  const complement = random.int(2) === 1;
  const last = N - 1;
  const moved = (cell: number): number => {
    let r = Math.floor(cell / N);
    let c = cell % N;
    if (mirror) c = last - c;
    for (let t = 0; t < turns; t++) [r, c] = [c, last - r];
    return r * N + c;
  };
  const digit = (v: number): number => (v === 0 || !complement ? v : N + 1 - v);
  const solution = new Array<number>(AREA);
  const givens = new Array<number>(AREA);
  const keys = new Array<number>(AREA);
  puzzle.cages.forEach((cage, i) => cage.cells.forEach(cell => (keys[moved(cell)] = i)));
  for (let cell = 0; cell < AREA; cell++) {
    solution[moved(cell)] = digit(puzzle.solution[cell]);
    givens[moved(cell)] = digit(puzzle.givens[cell]);
  }
  return { solution, givens, cages: cagesOf(keys, solution) };
}

/**
 * A 9 x 9 killer sudoku of the band from the seed: the same two arguments always give the same
 * puzzle, with exactly one solution. It takes a dug puzzle of the band from the bank and shows it
 * another way, both chosen by the seed, so it is ready at once on the tablet.
 */
export function generateKiller(seed: string, difficulty: Difficulty): KillerSudoku {
  const entries = KILLER_BANK[difficulty];
  if (!entries?.length) throw new RangeError(`a killer sudoku offers ${Object.keys(KILLER_BANK).join(', ')}, not ${difficulty}`);
  const random = createRandom(childSeed(seed, 'bank'));
  const view = viewKiller(decodeKiller(random.pick(entries)), random);
  const largestCage = Math.max(...view.cages.map(cage => cage.cells.length));
  const givens = view.givens.filter(v => v > 0).length;
  return {
    id: { game: 'killer-sudoku', size: String(N), difficulty, seed },
    shape: KILLER_SHAPE,
    ...view,
    rating: { difficulty, cages: view.cages.length, largestCage, givens },
  };
}
