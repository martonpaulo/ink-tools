/**
 * Star Battle (#392): a square grid cut into as many regions as it has rows; the player puts the
 * same number of stars (one or two) in every row, every column and every region, and no two stars
 * touch, not even at a corner.
 *
 * The generator places a seeded valid set of stars, grows the regions around them, and then moves
 * single border cells between regions until the solver finds no other solution: each move takes a
 * star of the other solution out of its region, so that solution breaks while the seeded one stays.
 *
 * The band comes from the human-style solve, as for nonograms. `easy` needs only the unit rules (a
 * full row, column or region empties its other cells; one with only as many free cells as missing
 * stars fills them; a star empties its neighbours), the look-ahead (a star that would leave a unit
 * too few cells cannot go there) and single confinement (a region inside one row empties the rest
 * of that row, and the other way round). `medium` also needs confinement over sets of units (m
 * regions inside m rows or columns), `hard` also needs probing (a star whose consequences break a
 * unit). A grid that still needs a guess is never offered.
 */

import { type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';

export interface StarBattleSize {
  /** Cells per side, which is also the number of regions. */
  side: number;
  /** Stars in each row, column and region. */
  stars: 1 | 2;
}

export interface StarBattle {
  id: PuzzleId;
  side: number;
  stars: 1 | 2;
  /** Row by row, the region of each cell, 0 to side - 1. */
  regions: number[];
  /** Row by row, true for a star. */
  solution: boolean[];
}

export const STAR_BATTLE_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const STAR_BATTLE_MIN_SIDE = 5;
export const STAR_BATTLE_MAX_SIDE = 10;
/** Two stars per line need room: under 8 cells a side, few grids fit and fewer have one solution. */
export const STAR_BATTLE_TWO_STAR_MIN_SIDE = 8;

const UNKNOWN = -1;
const EMPTY = 0;
const STAR = 1;
type Cells = Int8Array;

/** Unit kinds, in the order `Board.units` holds them: rows, columns, regions. */
const ROW = 0;
const COLUMN = 1;
const REGION = 2;
const UNIT_KINDS = 3;

/** The puzzle as the solvers read it: its side, stars, units and each cell's neighbours. */
interface Board {
  side: number;
  stars: number;
  /** Rows, then columns, then regions; each a list of cell indices. */
  units: number[][];
  /** The rows, columns and regions of each cell, as unit indices. */
  unitsOf: number[][];
  /** The up to 8 cells around each cell. */
  around: number[][];
}

function boardOf(side: number, stars: number, regions: readonly number[]): Board {
  const units: number[][] = Array.from({ length: UNIT_KINDS * side }, () => []);
  const unitsOf: number[][] = [];
  const around: number[][] = [];
  for (let i = 0; i < side * side; i++) {
    const r = Math.floor(i / side);
    const c = i % side;
    const own = [ROW * side + r, COLUMN * side + c, REGION * side + regions[i]];
    for (const u of own) units[u].push(i);
    unitsOf.push(own);
    const near: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < side && cc < side) near.push(rr * side + cc);
      }
    }
    around.push(near);
  }
  return { side, stars, units, unitsOf, around };
}

/** Puts a star and empties its neighbours; false when a neighbour already holds a star. */
function placeStar(board: Board, cells: Cells, cell: number): boolean {
  for (const n of board.around[cell]) if (cells[n] === STAR) return false;
  cells[cell] = STAR;
  for (const n of board.around[cell]) cells[n] = EMPTY;
  return true;
}

/**
 * The unit rules to a fixed point: a unit with all its stars empties its other cells, and one with
 * only as many free cells as missing stars fills them. False on a contradiction.
 */
function propagate(board: Board, cells: Cells): boolean {
  const k = board.stars;
  for (let changed = true; changed; ) {
    changed = false;
    for (const unit of board.units) {
      let stars = 0;
      let open = 0;
      for (const cell of unit) {
        if (cells[cell] === STAR) stars++;
        else if (cells[cell] === UNKNOWN) open++;
      }
      if (stars > k || stars + open < k) return false;
      if (open === 0) continue;
      if (stars === k) {
        for (const cell of unit) if (cells[cell] === UNKNOWN) cells[cell] = EMPTY;
        changed = true;
      } else if (stars + open === k) {
        for (const cell of unit) if (cells[cell] === UNKNOWN && !placeStar(board, cells, cell)) return false;
        changed = true;
      }
    }
  }
  return true;
}

/** The first `limit` solutions, by the unit rules and branching on the unit with the fewest free cells. */
function solutions(board: Board, limit: number): Cells[] {
  const found: Cells[] = [];
  const search = (cells: Cells): void => {
    if (!propagate(board, cells)) return;
    let best: number[] | null = null;
    let bestOpen = Infinity;
    for (const unit of board.units) {
      let open = 0;
      let stars = 0;
      for (const cell of unit) {
        if (cells[cell] === UNKNOWN) open++;
        else if (cells[cell] === STAR) stars++;
      }
      if (open > 0 && stars < board.stars && open < bestOpen) {
        best = unit;
        bestOpen = open;
      }
    }
    if (best === null) {
      found.push(cells);
      return;
    }
    // The unit's next star is at one of its free cells; the free cells before it hold none, so the
    // branches never overlap.
    const open = best.filter(cell => cells[cell] === UNKNOWN);
    for (let i = 0; i < open.length && found.length < limit; i++) {
      const next = cells.slice();
      for (let j = 0; j < i; j++) next[open[j]] = EMPTY;
      if (placeStar(board, next, open[i])) search(next);
    }
  };
  search(new Int8Array(board.side * board.side).fill(UNKNOWN));
  return found;
}

/** Solutions of the regions, counted up to `limit`. */
export function countStarBattleSolutions(size: StarBattleSize, regions: readonly number[], limit = 2): number {
  return solutions(boardOf(size.side, size.stars, regions), limit).length;
}

/** Confinement's pairs: some units of the first kind whose live cells lie in as many of the second. */
const CONFINE_PAIRS: readonly [inner: number, outer: number][] = [
  [REGION, ROW],
  [REGION, COLUMN],
  [ROW, REGION],
  [COLUMN, REGION],
];
/** Set bits of each mask up to 10 bits, the largest side. */
const BIT_COUNTS = (() => {
  const counts = new Uint8Array(1 << STAR_BATTLE_MAX_SIDE);
  for (let m = 1; m < counts.length; m++) counts[m] = counts[m >> 1] + (m & 1);
  return counts;
})();

/**
 * Confinement: m regions whose live cells (free or star) all lie in m rows need all the stars of
 * those rows, so the rest of the rows is empty; the same for columns, and with lines and regions
 * swapped. `wide` tries every set of units, else single units only (a region inside one row).
 * True when it emptied a cell.
 */
function confine(board: Board, cells: Cells, wide: boolean): boolean {
  const { side } = board;
  const all = (1 << side) - 1;
  const union = new Int32Array(1 << side);
  let emptied = false;
  const empty = (set: number, inner: number, outer: number, lines: number): void => {
    for (let o = 0; o < side; o++) {
      if (!(lines & (1 << o))) continue;
      for (const cell of board.units[outer * side + o]) {
        if (cells[cell] === UNKNOWN && !(set & (1 << (board.unitsOf[cell][inner] - inner * side)))) {
          cells[cell] = EMPTY;
          emptied = true;
        }
      }
    }
  };
  for (const [inner, outer] of CONFINE_PAIRS) {
    // spans[i]: the outer units the live cells of inner unit i lie in, as a bit mask.
    const spans = new Int32Array(side);
    for (let i = 0; i < side; i++) {
      for (const cell of board.units[inner * side + i]) if (cells[cell] !== EMPTY) spans[i] |= 1 << (board.unitsOf[cell][outer] - outer * side);
    }
    if (!wide) {
      for (let i = 0; i < side; i++) if (BIT_COUNTS[spans[i]] === 1) empty(1 << i, inner, outer, spans[i]);
      continue;
    }
    // Every set of inner units but the whole grid, which confines nothing; each union from a smaller one.
    for (let set = 1; set < all; set++) {
      const low = set & -set;
      union[set] = union[set ^ low] | spans[31 - Math.clz32(low)];
      if (BIT_COUNTS[union[set]] === BIT_COUNTS[set]) empty(set, inner, outer, union[set]);
    }
  }
  return emptied;
}

/**
 * The most stars the live cells of a unit can hold: no two stars share a 2 x 2 block, so a cover of
 * the cells by blocks bounds them. The blocks are laid from the first uncovered cell in reading
 * order, which is exact for a row or a column and an upper bound for a region.
 */
function capacity(board: Board, cells: Cells, unit: readonly number[]): number {
  const { side } = board;
  const covered = new Set<number>();
  let blocks = 0;
  for (const cell of unit) {
    if (cells[cell] === EMPTY || covered.has(cell)) continue;
    blocks++;
    const right = cell % side + 1 < side;
    for (const c of [cell, right ? cell + 1 : -1, cell + side, right ? cell + side + 1 : -1]) if (c >= 0) covered.add(c);
  }
  return blocks;
}

/** True when no unit holds too many stars or has room for too few. */
function consistent(board: Board, cells: Cells): boolean {
  for (const unit of board.units) {
    let stars = 0;
    for (const cell of unit) if (cells[cell] === STAR) stars++;
    if (stars > board.stars || capacity(board, cells, unit) < board.stars) return false;
  }
  return true;
}

/**
 * A free cell whose star, with its emptied neighbours, would leave some unit room for too few stars
 * is empty: the first look-ahead a solver learns. True when it emptied a cell.
 */
function crowd(board: Board, cells: Cells): boolean {
  let emptied = false;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== UNKNOWN) continue;
    const trial = cells.slice();
    if (placeStar(board, trial, i) && consistent(board, trial)) continue;
    cells[i] = EMPTY;
    emptied = true;
  }
  return emptied;
}

export interface StarBattleRating {
  difficulty: Difficulty;
  /** Times confinement over two or more units emptied a cell the easy rules could not. */
  confinements: number;
  /** Cells set by probing. */
  probes: number;
}

/**
 * The easy rules (the unit rules, the look-ahead and single-unit confinement) and, when `wide`,
 * confinement over sets of units, to a fixed point; false on a contradiction.
 */
function deduce(board: Board, cells: Cells, wide: boolean, onWide?: () => void): boolean {
  for (;;) {
    if (!propagate(board, cells)) return false;
    if (crowd(board, cells) || confine(board, cells, false)) continue;
    if (!wide || !confine(board, cells, true)) return true;
    onWide?.();
  }
}

/**
 * The rating of the regions, or null when the easy rules, wide confinement and probing cannot
 * finish them (a guess would be needed, or there is no solution).
 */
export function rateStarBattle(size: StarBattleSize, regions: readonly number[]): StarBattleRating | null {
  return rateTowards(boardOf(size.side, size.stars, regions), null);
}

/** `rateStarBattle`, giving up with null as soon as the `target` band is out of reach. */
function rateTowards(board: Board, target: Difficulty | null): StarBattleRating | null {
  const cells: Cells = new Int8Array(board.side * board.side).fill(UNKNOWN);
  if (!deduce(board, cells, false)) return null;
  if (target === 'easy' && cells.includes(UNKNOWN)) return null;
  let confinements = 0;
  if (!deduce(board, cells, true, () => confinements++)) return null;
  if (target === 'medium' && cells.includes(UNKNOWN)) return null;
  let probes = 0;
  // Probing: a star whose consequences break a unit means that cell is empty. The scan goes on
  // after a probe, and the scans end when one sets nothing.
  for (let probed = true; probed && cells.includes(UNKNOWN); ) {
    probed = false;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== UNKNOWN) continue;
      const trial = cells.slice();
      if (placeStar(board, trial, i) && deduce(board, trial, true)) continue;
      cells[i] = EMPTY;
      if (!deduce(board, cells, true)) return null;
      probes++;
      probed = true;
    }
  }
  if (cells.includes(UNKNOWN)) return null;
  const difficulty: Difficulty = probes > 0 ? 'hard' : confinements > 0 ? 'medium' : 'easy';
  return { difficulty, confinements, probes };
}

/** A seeded valid set of stars, row by row, or null when the row choices run out. */
function placeStars(random: Random, side: number, stars: number): boolean[] | null {
  // Every set of `stars` columns of one row with no two side by side.
  const choices: number[][] = [];
  const pick = (from: number, chosen: number[]): void => {
    if (chosen.length === stars) {
      choices.push(chosen.slice());
      return;
    }
    for (let c = from; c < side; c++) pick(c + 2, [...chosen, c]);
  };
  pick(0, []);
  const perColumn = new Array<number>(side).fill(0);
  const rows: number[][] = [];
  let steps = 0;
  const STEP_LIMIT = 30000;
  const fill = (r: number): boolean => {
    if (r === side) return perColumn.every(n => n === stars);
    if (++steps > STEP_LIMIT) return false;
    const above = r > 0 ? rows[r - 1] : [];
    for (const choice of random.shuffle(choices.slice())) {
      if (choice.some(c => perColumn[c] >= stars || above.some(a => Math.abs(a - c) <= 1))) continue;
      // The rows left must still fit the stars each column lacks.
      choice.forEach(c => perColumn[c]++);
      const left = side - r - 1;
      if (perColumn.every(n => stars - n <= Math.ceil(left / 2))) {
        rows.push(choice);
        if (fill(r + 1)) return true;
        rows.pop();
      }
      choice.forEach(c => perColumn[c]--);
    }
    return false;
  };
  if (!fill(0)) return null;
  const solution = new Array<boolean>(side * side).fill(false);
  rows.forEach((choice, r) => choice.forEach(c => (solution[r * side + c] = true)));
  return solution;
}

const sideNeighbours = (side: number, cell: number): number[] => {
  const r = Math.floor(cell / side);
  const c = cell % side;
  const out: number[] = [];
  if (r > 0) out.push(cell - side);
  if (c > 0) out.push(cell - 1);
  if (c + 1 < side) out.push(cell + 1);
  if (r + 1 < side) out.push(cell + side);
  return out;
};

/** Grows one region from each seed cell into its free side neighbours, in seeded order. */
function growRegions(random: Random, side: number, seeds: readonly number[][]): number[] {
  const regions = new Array<number>(side * side).fill(-1);
  seeds.forEach((cells, region) => cells.forEach(cell => (regions[cell] = region)));
  let free = regions.filter(r => r < 0).length;
  while (free > 0) {
    const region = random.int(seeds.length);
    const frontier: number[] = [];
    for (let cell = 0; cell < regions.length; cell++) {
      if (regions[cell] === region) for (const n of sideNeighbours(side, cell)) if (regions[n] < 0 && !frontier.includes(n)) frontier.push(n);
    }
    if (frontier.length === 0) continue;
    regions[random.pick(frontier)] = region;
    free--;
  }
  return regions;
}

/**
 * The cells that go with `cell` when it leaves its region: the parts of the region the cell's
 * removal cuts off from the region's seeded stars. Null when those stars would end up in two parts.
 */
function cutOff(side: number, regions: readonly number[], solution: readonly boolean[], cell: number): number[] | null {
  const region = regions[cell];
  const part = new Array<number>(regions.length).fill(-1);
  const parts: number[][] = [];
  for (let start = 0; start < regions.length; start++) {
    if (start === cell || regions[start] !== region || part[start] >= 0) continue;
    const cells = [start];
    part[start] = parts.length;
    for (let head = 0; head < cells.length; head++) {
      for (const n of sideNeighbours(side, cells[head])) {
        if (n !== cell && regions[n] === region && part[n] < 0) {
          part[n] = parts.length;
          cells.push(n);
        }
      }
    }
    parts.push(cells);
  }
  const starred = parts.filter(cells => cells.some(c => solution[c]));
  if (starred.length !== 1) return null;
  return [cell, ...parts.filter(cells => cells !== starred[0]).flat()];
}

/**
 * Regions with one star each, or with two: two-star regions are one-star regions joined in pairs
 * of side neighbours, found by a seeded search; null when no pairing joins them all.
 */
function regionsFor(random: Random, side: number, stars: number, solution: readonly boolean[]): number[] | null {
  const starCells = solution.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
  const single = growRegions(random, side, starCells.map(cell => [cell]));
  if (stars === 1) return single;
  const touching = starCells.map(() => new Set<number>());
  single.forEach((region, cell) => {
    for (const n of sideNeighbours(side, cell)) if (single[n] !== region) touching[region].add(single[n]);
  });
  const partner = new Array<number>(starCells.length).fill(-1);
  const pair = (): boolean => {
    const first = partner.indexOf(-1);
    if (first < 0) return true;
    for (const other of random.shuffle([...touching[first]])) {
      if (partner[other] >= 0) continue;
      partner[first] = other;
      partner[other] = first;
      if (pair()) return true;
      partner[first] = -1;
      partner[other] = -1;
    }
    return false;
  };
  if (!pair()) return null;
  // Each pair is numbered by its first region, 0 to side - 1.
  const number = new Array<number>(starCells.length).fill(-1);
  let next = 0;
  for (let region = 0; region < partner.length; region++) {
    if (number[region] < 0) number[region] = number[partner[region]] = next++;
  }
  return single.map(region => number[region]);
}

/** Moves made towards one solution per attempt, per cell, before it is given up; 10 x 10 needed at most 73. */
const MOVES_PER_CELL = 2.5;
/** Attempts per puzzle; each starts from new stars and regions. */
const STAR_BATTLE_ATTEMPTS = 144;

/**
 * Moves border cells until the seeded stars are the one solution: each move takes a star of
 * another solution into a side neighbour's region, which breaks that solution. Null when no move
 * is left.
 */
function makeUnique(random: Random, side: number, stars: number, regions: number[], solution: readonly boolean[]): number[] | null {
  let current = regions;
  for (let move = 0; move < MOVES_PER_CELL * side * side; move++) {
    const found = solutions(boardOf(side, stars, current), 2);
    const other = found.find(cells => cells.some((v, i) => (v === STAR) !== solution[i]));
    if (!other) return found.length === 1 ? current : null;
    // A star of the other solution leaves its region for a side neighbour's, with any part of its
    // region it would cut off; the region keeps its seeded stars, and the other solution breaks.
    const candidates: [moving: number[], to: number][] = [];
    for (let cell = 0; cell < other.length; cell++) {
      if (other[cell] !== STAR || solution[cell]) continue;
      const moving = cutOff(side, current, solution, cell);
      if (!moving) continue;
      for (const n of sideNeighbours(side, cell)) if (current[n] !== current[cell]) candidates.push([moving, current[n]]);
    }
    if (candidates.length === 0) return null;
    const [moving, to] = random.pick(candidates);
    current = current.slice();
    for (const cell of moving) current[cell] = to;
  }
  return null;
}

function sizeToken(size: StarBattleSize): string {
  return `${size.side}S${size.stars}`;
}

/**
 * The bands a size offers. With two stars per line past 8 cells a side, the easy rules and
 * confinement finish under 5 % of the grids (2 of 100 at 9 x 9, none at 10 x 10, #392), so those
 * sizes offer `hard` only. shortcut: no two-star rule beyond the 2 x 2 bound; add the two-line
 * block count when an easy or medium 10 x 10 with two stars is wanted.
 */
export function starBattleBands(size: StarBattleSize): readonly Difficulty[] {
  checkSize(size);
  return size.stars === 2 && size.side > STAR_BATTLE_TWO_STAR_MIN_SIDE ? ['hard'] : STAR_BATTLE_BANDS;
}

/** Throws on a side outside 5 to 10, a star count other than 1 or 2, or two stars under 8 cells a side. */
function checkSize(size: StarBattleSize): void {
  const { side, stars } = size;
  if (!Number.isInteger(side) || side < STAR_BATTLE_MIN_SIDE || side > STAR_BATTLE_MAX_SIDE) {
    throw new RangeError(`a star battle side is ${STAR_BATTLE_MIN_SIDE} to ${STAR_BATTLE_MAX_SIDE} cells, not ${side}`);
  }
  if (stars !== 1 && stars !== 2) throw new RangeError(`a star battle has 1 or 2 stars per line, not ${stars}`);
  if (stars === 2 && side < STAR_BATTLE_TWO_STAR_MIN_SIDE) {
    throw new RangeError(`two stars per line need at least ${STAR_BATTLE_TWO_STAR_MIN_SIDE} cells a side, not ${side}`);
  }
}

/**
 * A star battle of the given size and band from the seed. Throws on a size not offered, a band not
 * offered, or when the attempts run out.
 */
export function generateStarBattle(seed: string, size: StarBattleSize, difficulty: Difficulty): StarBattle {
  const bands = starBattleBands(size);
  if (!bands.includes(difficulty)) throw new RangeError(`a ${sizeToken(size)} star battle offers ${bands.join(', ')}, not ${difficulty}`);
  const { side, stars } = size;
  for (let i = 0; i < STAR_BATTLE_ATTEMPTS; i++) {
    const random = createRandom(childSeed(seed, i));
    const solution = placeStars(random, side, stars);
    if (!solution) continue;
    const grown = regionsFor(random, side, stars, solution);
    if (!grown) continue;
    const regions = makeUnique(random, side, stars, grown, solution);
    if (!regions) continue;
    // A rating proves uniqueness too: every deduction it makes is forced, and it finishes the grid.
    if (rateTowards(boardOf(side, stars, regions), difficulty)?.difficulty !== difficulty) continue;
    return { id: { game: 'star-battle', size: sizeToken(size), difficulty, seed }, side, stars, regions, solution };
  }
  throw new Error(`no ${difficulty} ${side} x ${side} star battle with ${stars} stars from seed «${seed}» in ${STAR_BATTLE_ATTEMPTS} attempts`);
}

