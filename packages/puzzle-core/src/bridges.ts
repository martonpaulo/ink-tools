/**
 * Bridges, also called Hashiwokakero (#396): islands with a number on a grid. The player joins them
 * with straight bridges along a row or a column, one or two between a pair, none crossing another
 * or an island, each island carrying as many bridges as its number, and all islands connected.
 * Written from the rules; no code of another collection is used.
 *
 * The generator grows a connected set of islands and bridges from a seed, then a solver proves the
 * numbers name that one solution. The band comes from the solve, as a nonogram's does:
 *
 * - `easy`: each island's count alone (bounds and crossings) finishes the grid;
 * - `medium`: it also needs connection: a bridge that would close a group of full islands away
 *   from the rest is ruled out;
 * - `hard`: it also needs probing: a bridge count that breaks the grid when tried is ruled out.
 *
 * A grid that still needs a guess is never offered. `countBridgesSolutions` is the plain search
 * the tests use to pin the solution count.
 */

import { type Difficulty, type PuzzleId } from './code';
import { childSeed, createRandom, type Random } from './random';

export interface BridgesSize {
  width: number;
  height: number;
}

export interface BridgesIsland {
  column: number;
  row: number;
  /** The number printed on the island: the bridges it carries, 1 to 8. */
  clue: number;
}

/** Two islands that see each other along a row or a column, with nothing between them. */
export interface BridgesLink {
  /** Island indexes, the smaller first. */
  from: number;
  to: number;
  horizontal: boolean;
}

export interface Bridges {
  id: PuzzleId;
  width: number;
  height: number;
  /** Row by row, left to right. */
  islands: BridgesIsland[];
  /** The bridges on each link of `bridgesLinks(islands)`, in its order: 0, 1 or 2. */
  solution: number[];
}

export const BRIDGES_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
/** A hard grid needs `hardMinSide` cells a side: under it, fewer than 1 seed in 2 found one in the attempts. */
export const BRIDGES_LIMITS = { minSide: 5, maxSide: 15, hardMinSide: 7 } as const;
/** The most bridges one pair of islands can share. */
export const MAX_BRIDGES = 2;

/** One island per this many cells, about; the research report's sizes hold 10 to 45 islands. */
const CELLS_PER_ISLAND = 5;
/** How often a new bridge is double, in percent, per band: doubles give the count rules more to work with. */
const DOUBLE_PERCENT: Record<string, number> = { easy: 55, medium: 35, hard: 15 };
/** How often a pair that sees each other gets an extra bridge, in percent: loops make a grid harder. */
const LOOP_PERCENT: Record<string, number> = { easy: 10, medium: 25, hard: 60 };
/** The growth gives up a placement after this many tries per wanted island. */
const TRIES_PER_ISLAND = 40;
/** Fewer islands than this share of the wanted count is a failed attempt. */
const MIN_FILL_PERCENT = 70;
/**
 * shortcut: a hard grid is found by chance among the grown ones. With 500 attempts 1 seed in 150 of
 * 8 x 8 found none; with these, none of 150 seeds each of 7 x 7, 8 x 8 and 9 x 9 failed, and easy and
 * medium never failed. A seed that still finds none throws. Upgrade to a generator that steers
 * towards probing if the plugin shows that failure or the tablet is too slow.
 */
const ATTEMPTS = 750;

/** Edge domains are bit sets of the counts still possible: bit k for k bridges. */
const ALL_COUNTS = 0b111;
type Domains = Uint8Array;

const bit = (count: number): number => 1 << count;
const lowest = (mask: number): number => (mask & bit(0) ? 0 : mask & bit(1) ? 1 : MAX_BRIDGES);
const highest = (mask: number): number => (mask & bit(MAX_BRIDGES) ? MAX_BRIDGES : mask & bit(1) ? 1 : 0);
/** True when exactly one count is left. */
const single = (mask: number): boolean => mask !== 0 && (mask & (mask - 1)) === 0;
/** The counts lo to hi as a mask. */
const range = (lo: number, hi: number): number => (lo > hi ? 0 : ((1 << (hi + 1)) - 1) & ~((1 << lo) - 1));

/** The links of a grid: each island with the next island to its right and below it. */
export function bridgesLinks(islands: readonly BridgesIsland[]): BridgesLink[] {
  const at = new Map<string, number>();
  islands.forEach((island, i) => at.set(`${island.column},${island.row}`, i));
  const width = Math.max(...islands.map(island => island.column)) + 1;
  const height = Math.max(...islands.map(island => island.row)) + 1;
  const links: BridgesLink[] = [];
  islands.forEach((island, i) => {
    for (let c = island.column + 1; c < width; c++) {
      const j = at.get(`${c},${island.row}`);
      if (j === undefined) continue;
      links.push({ from: i, to: j, horizontal: true });
      break;
    }
    for (let r = island.row + 1; r < height; r++) {
      const j = at.get(`${island.column},${r}`);
      if (j === undefined) continue;
      links.push({ from: i, to: j, horizontal: false });
      break;
    }
  });
  return links;
}

/** True when a horizontal and a vertical link cross between their islands. */
function crosses(islands: readonly BridgesIsland[], h: BridgesLink, v: BridgesLink): boolean {
  const [a, b, c, d] = [islands[h.from], islands[h.to], islands[v.from], islands[v.to]];
  return a.column < c.column && c.column < b.column && c.row < a.row && a.row < d.row;
}

/** What the solver needs about a grid, built once per puzzle. */
interface Model {
  islands: readonly BridgesIsland[];
  links: BridgesLink[];
  /** The links of each island. */
  linksOf: number[][];
  /** The links each link crosses. */
  crossing: number[][];
}

function modelOf(islands: readonly BridgesIsland[]): Model {
  const links = bridgesLinks(islands);
  const linksOf: number[][] = islands.map(() => []);
  links.forEach((link, e) => {
    linksOf[link.from].push(e);
    linksOf[link.to].push(e);
  });
  const crossing: number[][] = links.map(() => []);
  links.forEach((h, e) => {
    if (!h.horizontal) return;
    links.forEach((v, f) => {
      if (!v.horizontal && crosses(islands, h, v)) {
        crossing[e].push(f);
        crossing[f].push(e);
      }
    });
  });
  return { islands, links, linksOf, crossing };
}

function startDomains(model: Model): Domains {
  return Uint8Array.from(model.links, link =>
    range(0, Math.min(MAX_BRIDGES, model.islands[link.from].clue, model.islands[link.to].clue)),
  );
}

/** Islands reached from island 0 over links whose domain allows a bridge (`possible`) or forces one. */
function reached(model: Model, domains: Domains, possible: boolean): number {
  const seen = new Uint8Array(model.islands.length);
  seen[0] = 1;
  const queue = [0];
  for (let head = 0; head < queue.length; head++) {
    for (const e of model.linksOf[queue[head]]) {
      if ((possible ? highest(domains[e]) : lowest(domains[e])) === 0) continue;
      const link = model.links[e];
      const other = link.from === queue[head] ? link.to : link.from;
      if (!seen[other]) {
        seen[other] = 1;
        queue.push(other);
      }
    }
  }
  return queue.length;
}

/**
 * The connection rule: a link whose highest count would fill every island of the group it joins,
 * counting only the bridges already forced, closes that group off from the rest, so it is ruled out.
 */
function closesGroup(model: Model, domains: Domains, e: number, count: number): boolean {
  const n = model.islands.length;
  const atLeast = (f: number): number => (f === e ? count : lowest(domains[f]));
  const seen = new Uint8Array(n);
  const start = model.links[e].from;
  seen[start] = 1;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const island = queue[head];
    let sum = 0;
    for (const f of model.linksOf[island]) {
      const bridges = atLeast(f);
      sum += bridges;
      if (bridges === 0) continue;
      const link = model.links[f];
      const other = link.from === island ? link.to : link.from;
      if (!seen[other]) {
        seen[other] = 1;
        queue.push(other);
      }
    }
    if (sum !== model.islands[island].clue) return false;
  }
  return queue.length < n;
}

const FAILED = false;

/**
 * Applies the rules of the level until nothing changes: 1 is the counts and crossings, 2 adds the
 * connection rule. Answers false when the domains have no solution.
 */
function propagate(model: Model, domains: Domains, level: number): boolean {
  let changed = true;
  const narrow = (e: number, mask: number): boolean => {
    const next = domains[e] & mask;
    if (next === domains[e]) return true;
    domains[e] = next;
    changed = true;
    return next !== 0;
  };
  while (changed) {
    changed = false;
    for (let i = 0; i < model.islands.length; i++) {
      const clue = model.islands[i].clue;
      let sumLo = 0;
      let sumHi = 0;
      for (const e of model.linksOf[i]) {
        sumLo += lowest(domains[e]);
        sumHi += highest(domains[e]);
      }
      if (clue < sumLo || clue > sumHi) return FAILED;
      for (const e of model.linksOf[i]) {
        const lo = lowest(domains[e]);
        const hi = highest(domains[e]);
        if (!narrow(e, range(Math.max(lo, clue - (sumHi - hi)), Math.min(hi, clue - (sumLo - lo))))) return FAILED;
      }
    }
    for (let e = 0; e < model.links.length; e++) {
      if (lowest(domains[e]) === 0) continue;
      for (const f of model.crossing[e]) if (!narrow(f, 1)) return FAILED;
    }
    if (level >= 2) {
      if (reached(model, domains, true) < model.islands.length) return FAILED;
      for (let e = 0; e < model.links.length; e++) {
        const hi = highest(domains[e]);
        if (!single(domains[e]) && closesGroup(model, domains, e, hi) && !narrow(e, ~(1 << hi))) return FAILED;
      }
    }
  }
  return true;
}

const solved = (domains: Domains): boolean => domains.every(single);

/** A full assignment is a solution only when its bridges connect every island. */
function connected(model: Model, domains: Domains): boolean {
  return reached(model, domains, false) === model.islands.length;
}

/** Probing: a count that breaks the grid at level 2 when tried is ruled out. False on a contradiction. */
function probe(model: Model, domains: Domains): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (let e = 0; e < model.links.length; e++) {
      if (single(domains[e])) continue;
      for (let count = 0; count <= MAX_BRIDGES; count++) {
        if (!(domains[e] & (1 << count))) continue;
        const trial = domains.slice();
        trial[e] = 1 << count;
        const ok = propagate(model, trial, 2) && (!solved(trial) || connected(model, trial));
        if (ok) continue;
        domains[e] &= ~(1 << count);
        if (domains[e] === 0 || !propagate(model, domains, 2)) return false;
        changed = true;
      }
    }
  }
  return true;
}

/**
 * The band a grid's solve needs, with its one solution, or null when the rules here cannot finish it
 * without a guess (or it has no solution). Every rule only rules out what cannot be, so a finished
 * solve proves the solution is the only one.
 */
export function rateBridges(islands: readonly BridgesIsland[]): { difficulty: Difficulty; solution: number[] } | null {
  const model = modelOf(islands);
  const domains = startDomains(model);
  const finished = (difficulty: Difficulty) =>
    solved(domains) && connected(model, domains) ? { difficulty, solution: Array.from(domains, lowest) } : null;
  if (!propagate(model, domains, 1)) return null;
  if (solved(domains)) return finished('easy');
  if (!propagate(model, domains, 2)) return null;
  if (solved(domains)) return finished('medium');
  if (!probe(model, domains)) return null;
  return solved(domains) ? finished('hard') : null;
}

/** How many solutions the islands have, counted by plain search up to `limit`. */
export function countBridgesSolutions(islands: readonly BridgesIsland[], limit = 2): number {
  const model = modelOf(islands);
  const search = (domains: Domains): number => {
    if (!propagate(model, domains, 1)) return 0;
    if (solved(domains)) return connected(model, domains) ? 1 : 0;
    const e = domains.findIndex(mask => !single(mask));
    let total = 0;
    for (let count = 0; count <= MAX_BRIDGES && total < limit; count++) {
      if (!(domains[e] & (1 << count))) continue;
      const next = domains.slice();
      next[e] = 1 << count;
      total += search(next);
    }
    return Math.min(total, limit);
  };
  return search(startDomains(model));
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const FREE = 0;
const ISLAND = 1;
const BRIDGE = 2;

/**
 * Grows islands and bridges from one island: each step leaves an island along a free row or column
 * and places a new island at least two cells away, never beside another island. Then pairs that see
 * each other over free cells get a loop bridge now and then. Answers the islands with their numbers.
 */
function grow(random: Random, width: number, height: number, difficulty: Difficulty): BridgesIsland[] | null {
  const want = Math.max(2, Math.round((width * height) / CELLS_PER_ISLAND));
  const cells = new Uint8Array(width * height);
  const placed: [number, number][] = [];
  const bridges = new Map<string, number>();
  const clueAt = new Map<number, number>();
  const at = (c: number, r: number): number => r * width + c;
  const inside = (c: number, r: number): boolean => c >= 0 && c < width && r >= 0 && r < height;
  const lonely = (c: number, r: number): boolean =>
    STEPS.every(([dc, dr]) => !inside(c + dc, r + dr) || cells[at(c + dc, r + dr)] !== ISLAND);
  const bridge = (a: number, b: number, count: number, path: number[]): void => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    bridges.set(key, (bridges.get(key) ?? 0) + count);
    clueAt.set(a, (clueAt.get(a) ?? 0) + count);
    clueAt.set(b, (clueAt.get(b) ?? 0) + count);
    for (const cell of path) cells[cell] = BRIDGE;
  };
  const count = (): number => (random.chance(DOUBLE_PERCENT[difficulty]) ? MAX_BRIDGES : 1);

  const first: [number, number] = [random.int(width), random.int(height)];
  cells[at(...first)] = ISLAND;
  placed.push(first);
  for (let tries = 0; placed.length < want && tries < want * TRIES_PER_ISLAND; tries++) {
    const [c0, r0] = random.pick(placed);
    const [dc, dr] = random.pick(STEPS);
    const room = dc > 0 ? width - 1 - c0 : dc < 0 ? c0 : dr > 0 ? height - 1 - r0 : r0;
    if (room < 2) continue;
    const length = 2 + random.int(room - 1);
    const path: number[] = [];
    let free = true;
    for (let k = 1; k < length && free; k++) {
      const cell = at(c0 + k * dc, r0 + k * dr);
      free = cells[cell] === FREE;
      path.push(cell);
    }
    const [c1, r1] = [c0 + length * dc, r0 + length * dr];
    if (!free || cells[at(c1, r1)] !== FREE || !lonely(c1, r1)) continue;
    cells[at(c1, r1)] = ISLAND;
    placed.push([c1, r1]);
    bridge(at(c0, r0), at(c1, r1), count(), path);
  }
  if (placed.length * 100 < want * MIN_FILL_PERCENT) return null;

  // Loop bridges between islands that see each other over free cells.
  const order = placed.map(([c, r]) => at(c, r)).sort((a, b) => a - b);
  for (const start of order) {
    const c0 = start % width;
    const r0 = Math.floor(start / width);
    for (const [dc, dr] of STEPS.slice(0, 2)) {
      const path: number[] = [];
      let c = c0 + dc;
      let r = r0 + dr;
      while (inside(c, r) && cells[at(c, r)] === FREE) {
        path.push(at(c, r));
        c += dc;
        r += dr;
      }
      if (!inside(c, r) || cells[at(c, r)] !== ISLAND || path.length === 0) continue;
      const key = `${start},${at(c, r)}`;
      if (bridges.has(key) || !random.chance(LOOP_PERCENT[difficulty])) continue;
      bridge(start, at(c, r), count(), path);
    }
  }
  return order.map(cell => ({ column: cell % width, row: Math.floor(cell / width), clue: clueAt.get(cell) ?? 0 }));
}

export const bridgesSizeToken = (size: BridgesSize): string => `${size.width}X${size.height}`;

/**
 * A Bridges grid of the given size and band from the seed, with its one solution. Throws when no
 * grid of that band is found in the attempts.
 */
export function generateBridges(seed: string, size: BridgesSize, difficulty: Difficulty): Bridges {
  const { width, height } = size;
  for (const side of [width, height]) {
    if (!Number.isInteger(side) || side < BRIDGES_LIMITS.minSide || side > BRIDGES_LIMITS.maxSide) {
      throw new RangeError(`a Bridges side is ${BRIDGES_LIMITS.minSide} to ${BRIDGES_LIMITS.maxSide} cells, not ${side}`);
    }
  }
  if (!BRIDGES_BANDS.includes(difficulty)) throw new RangeError(`Bridges offers ${BRIDGES_BANDS.join(', ')}, not ${difficulty}`);
  if (difficulty === 'hard' && Math.min(width, height) < BRIDGES_LIMITS.hardMinSide) {
    throw new RangeError(`a hard Bridges grid is at least ${BRIDGES_LIMITS.hardMinSide} cells a side, not ${width} x ${height}`);
  }
  for (let i = 0; i < ATTEMPTS; i++) {
    const islands = grow(createRandom(childSeed(seed, i)), width, height, difficulty);
    if (!islands) continue;
    const rated = rateBridges(islands);
    if (rated?.difficulty !== difficulty) continue;
    return { id: { game: 'bridges', size: bridgesSizeToken(size), difficulty, seed }, width, height, islands, solution: rated.solution };
  }
  throw new Error(`no ${difficulty} ${width} x ${height} Bridges grid from seed «${seed}» in ${ATTEMPTS} attempts`);
}
