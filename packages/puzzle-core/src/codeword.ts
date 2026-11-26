/**
 * Codeword (#399): a crossword grid with no clues, where every white cell holds a number and the
 * same number is always the same letter. A few letters are given; the player finds the rest.
 *
 * The grid is a British-style lattice: on a side of odd length, every cell whose row or column is
 * even is white, and every word crosses another at its even positions. Blocks at odd places split
 * the long lines into words of 3, 5 or 7 letters. The fill takes the most frequent words of the
 * language's list (#381); the band sets how many, and how many letters are given. The solver counts
 * every letter key that spells a word of the whole list in every slot, so a puzzle has exactly one.
 *
 * The puzzle code keeps the language in its size token (`13PT`), so a code gives the same puzzle.
 */

import { checkCells, readCells, type CheckResult, type InkStroke, type Recognize } from './check';
import { puzzleCode, type Difficulty, type PuzzleId } from './code';
import {
  FONT_WEIGHTS,
  createPage,
  drawCellText,
  drawCentredText,
  drawFooter,
  drawSquareLattice,
  fillRect,
  fitCellMm,
  layoutPage,
  LINE_PX,
  type CellPreset,
  type Grid,
  type Hand,
  type Orientation,
  type PageLayout,
  type Raster,
} from './page';
import { childSeed, createRandom, type Random } from './random';
import { type WordList } from './words';

export const CODEWORD_BANDS: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const CODEWORD_LIMITS = { minSide: 5, maxSide: 15 } as const;

/**
 * Per band: how many of the most frequent words the fill draws from, and the fewest letters given.
 * [inference] tuned on the five lists so every band fills on a 13 x 13 grid within its attempts.
 */
export const CODEWORD_BAND_RULES: Readonly<Record<string, { vocabulary: number; minGivens: number }>> = {
  easy: { vocabulary: 4000, minGivens: 6 },
  medium: { vocabulary: 7000, minGivens: 4 },
  hard: { vocabulary: 10000, minGivens: 2 },
};

/** The word lengths the blocks cut a line into. */
const RUN_LENGTHS = [3, 5, 7] as const;
const PATTERN_TRIES = 20;
const FILL_ATTEMPTS = 30;
/** Search nodes per fill attempt, and the candidates tried at one slot, so a dead start is dropped fast. */
const FILL_NODES = 450;
const FILL_BRANCH = 8;
/** Search nodes the uniqueness count may spend before it gives up on a grid. */
const SOLVE_NODES = 200000;

export type SlotDirection = 'across' | 'down';

export interface CodewordSlot {
  direction: SlotDirection;
  /** Its cells, first letter first (row * size + column). */
  cells: number[];
}

export interface Codeword {
  id: PuzzleId;
  language: WordList['language'];
  size: number;
  /** One number per cell, row by row: 0 for a block, else 1 to `key.length`. */
  numbers: number[];
  /** The letter of each number: `key[n - 1]`. */
  key: string[];
  /** The numbers whose letter the page prints, smallest first. */
  givens: number[];
  slots: CodewordSlot[];
  /** Each slot's word, in the order of `slots`. */
  words: string[];
}

export type CodewordList = Pick<WordList, 'language' | 'alphabet' | 'words'>;

/** The block positions that cut a line of `n` cells into words of `RUN_LENGTHS`. */
function lineBlocks(n: number, random: Random): number[] {
  const blocks: number[] = [];
  let start = 0;
  for (;;) {
    const remaining = n - start;
    const options = RUN_LENGTHS.filter(length => length === remaining || remaining - length - 1 >= RUN_LENGTHS[0]);
    if (options.length === 0) throw new Error(`a line of ${remaining} cells cannot be cut into words`);
    const length = random.pick(options);
    if (length === remaining) return blocks;
    blocks.push(start + length);
    start += length + 1;
  }
}

function connected(size: number, white: readonly boolean[]): boolean {
  const first = white.indexOf(true);
  const seen = new Set<number>([first]);
  const queue = [first];
  while (queue.length > 0) {
    const cell = queue.pop() as number;
    const row = Math.floor(cell / size);
    const col = cell % size;
    for (const [r, c] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
      const next = r * size + c;
      if (r < 0 || c < 0 || r >= size || c >= size || !white[next] || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === white.filter(Boolean).length;
}

/** The white cells of a lattice with its lines cut into words, connected. */
export function codewordPattern(size: number, random: Random): boolean[] {
  for (let t = 0; t < PATTERN_TRIES; t++) {
    const white = Array.from({ length: size * size }, (_, i) => Math.floor(i / size) % 2 === 0 || (i % size) % 2 === 0);
    for (let line = 0; line < size; line += 2) {
      for (const at of lineBlocks(size, random)) white[line * size + at] = false;
      for (const at of lineBlocks(size, random)) white[at * size + line] = false;
    }
    if (connected(size, white)) return white;
  }
  throw new Error(`no connected ${size} x ${size} codeword pattern in ${PATTERN_TRIES} tries`);
}

/** Every run of two or more white cells, across then down. */
export function codewordSlots(size: number, white: readonly boolean[]): CodewordSlot[] {
  const slots: CodewordSlot[] = [];
  for (const direction of ['across', 'down'] as const) {
    for (let line = 0; line < size; line++) {
      let run: number[] = [];
      for (let at = 0; at <= size; at++) {
        const cell = direction === 'across' ? line * size + at : at * size + line;
        if (at < size && white[cell]) {
          run.push(cell);
          continue;
        }
        if (run.length >= 2) slots.push({ direction, cells: run });
        run = [];
      }
    }
  }
  return slots;
}

/** Word indices by length, then by position and letter, ascending, for the fill. */
interface FillIndex {
  words: Map<number, string[]>;
  at: Map<number, Map<string, number[]>[]>;
}

function fillIndex(words: readonly string[]): FillIndex {
  const index: FillIndex = { words: new Map(), at: new Map() };
  for (const word of words) {
    const chars = [...word];
    const length = chars.length;
    let list = index.words.get(length);
    let at = index.at.get(length);
    if (!list || !at) {
      list = [];
      at = chars.map(() => new Map<string, number[]>());
      index.words.set(length, list);
      index.at.set(length, at);
    }
    const id = list.length;
    list.push(word);
    chars.forEach((ch, p) => {
      const bucket = (at as Map<string, number[]>[])[p];
      const ids = bucket.get(ch);
      if (ids) ids.push(id);
      else bucket.set(ch, [id]);
    });
  }
  return index;
}

function intersect(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  }
  return out;
}

/** The words of the slot's length that agree with its letters so far, never one already used. */
function fillCandidates(index: FillIndex, slot: CodewordSlot, letters: readonly string[], used: ReadonlySet<string>): string[] {
  const length = slot.cells.length;
  const words = index.words.get(length) ?? [];
  const at = index.at.get(length);
  const lists: number[][] = [];
  for (let p = 0; p < length; p++) {
    const letter = letters[slot.cells[p]];
    if (!letter) continue;
    const ids = at?.[p].get(letter);
    if (!ids) return [];
    lists.push(ids);
  }
  if (lists.length === length) {
    const word = slot.cells.map(cell => letters[cell]).join('');
    return words.includes(word) && !used.has(word) ? [word] : [];
  }
  if (lists.length === 0) return words.filter(word => !used.has(word));
  lists.sort((x, y) => x.length - y.length);
  let ids = lists[0];
  for (let k = 1; k < lists.length && ids.length > 0; k++) ids = intersect(ids, lists[k]);
  return ids.map(id => words[id]).filter(word => !used.has(word));
}

/** Fills every slot with a distinct word, most constrained slot first; null when the budget runs out. */
function fillGrid(size: number, slots: readonly CodewordSlot[], index: FillIndex, random: Random): string[] | null {
  const letters = new Array<string>(size * size).fill('');
  const chosen = new Array<string>(slots.length).fill('');
  const used = new Set<string>();
  let nodes = FILL_NODES;
  const search = (): boolean => {
    if (--nodes < 0) return false;
    let best = -1;
    let bestCandidates: string[] = [];
    for (let s = 0; s < slots.length; s++) {
      if (chosen[s]) continue;
      const candidates = fillCandidates(index, slots[s], letters, used);
      if (candidates.length === 0) return false;
      if (best < 0 || candidates.length < bestCandidates.length) {
        best = s;
        bestCandidates = candidates;
      }
    }
    if (best < 0) return true;
    const slot = slots[best];
    for (const word of random.shuffle(bestCandidates).slice(0, FILL_BRANCH)) {
      const before = slot.cells.map(cell => letters[cell]);
      [...word].forEach((ch, p) => (letters[slot.cells[p]] = ch));
      chosen[best] = word;
      used.add(word);
      if (search()) return true;
      used.delete(word);
      chosen[best] = '';
      slot.cells.forEach((cell, p) => (letters[cell] = before[p]));
      if (nodes < 0) return false;
    }
    return false;
  };
  return search() ? chosen : null;
}

/** A word's or a slot's shape: each symbol as the position it first appears at. */
function shapeOf(symbols: readonly (string | number)[]): string {
  return symbols.map(symbol => symbols.indexOf(symbol)).join(',');
}

export interface CodewordSolveResult {
  /** Letter keys found, never more than the limit; `null` when the node budget ran out first. */
  count: number | null;
  /** Each key found: the letter of number n at `n - 1`. */
  keys: string[][];
}

/**
 * Counts the letter keys that make every slot a word of `words`, up to `limit`. Two numbers never
 * share a letter, and each given number keeps its letter. Slot words may repeat.
 */
export function solveCodeword(
  numbers: readonly number[],
  slots: readonly CodewordSlot[],
  givens: ReadonlyMap<number, string>,
  words: readonly string[],
  limit: number,
): CodewordSolveResult {
  const count = Math.max(0, ...numbers);
  const byShape = new Map<string, string[]>();
  for (const word of words) {
    const chars = [...word];
    const key = `${chars.length}:${shapeOf(chars)}`;
    const list = byShape.get(key);
    if (list) list.push(word);
    else byShape.set(key, [word]);
  }
  const key = new Array<string>(count + 1).fill('');
  const owner = new Map<string, number>();
  for (const [n, letter] of givens) {
    if (owner.has(letter)) throw new RangeError(`«${letter}» is given for two numbers`);
    key[n] = letter;
    owner.set(letter, n);
  }
  const slotNumbers = slots.map(slot => slot.cells.map(cell => numbers[cell]));
  const fits = (word: string, nums: readonly number[]): boolean => {
    let p = 0;
    for (const ch of word) {
      const n = nums[p++];
      if (key[n] ? key[n] !== ch : owner.has(ch)) return false;
    }
    return true;
  };
  const candidates = slotNumbers.map(nums => (byShape.get(`${nums.length}:${shapeOf(nums)}`) ?? []).filter(word => fits(word, nums)));
  const found: string[][] = [];
  let nodes = SOLVE_NODES;
  let exhausted = false;

  const search = (): boolean => {
    if (--nodes < 0) {
      exhausted = true;
      return true;
    }
    let best = -1;
    let bestFits: string[] = [];
    for (let s = 0; s < slotNumbers.length; s++) {
      const nums = slotNumbers[s];
      const open = nums.some(n => !key[n]);
      const fitting: string[] = [];
      for (const word of candidates[s]) {
        if (fits(word, nums)) {
          fitting.push(word);
          if (open && best >= 0 && fitting.length >= bestFits.length) break;
          if (!open) break;
        }
      }
      if (fitting.length === 0) return false;
      if (open && (best < 0 || fitting.length < bestFits.length)) {
        best = s;
        bestFits = fitting;
      }
    }
    if (best < 0) {
      found.push(key.slice(1));
      return found.length >= limit;
    }
    const nums = slotNumbers[best];
    for (const word of bestFits) {
      const added: number[] = [];
      let p = 0;
      for (const ch of word) {
        const n = nums[p++];
        if (!key[n]) {
          key[n] = ch;
          owner.set(ch, n);
          added.push(n);
        }
      }
      const done = search();
      for (const n of added) {
        owner.delete(key[n]);
        key[n] = '';
      }
      if (done) return true;
    }
    return false;
  };
  if (limit > 0) search();
  return { count: exhausted ? null : found.length, keys: found };
}

/**
 * A codeword of the given odd side and band from the seed, in the list's language. Throws on a side
 * out of range or even, a band it does not offer, or when no grid fills with one solution in the
 * attempts.
 */
export function generateCodeword(seed: string, size: number, difficulty: Difficulty, list: CodewordList): Codeword {
  if (!Number.isInteger(size) || size < CODEWORD_LIMITS.minSide || size > CODEWORD_LIMITS.maxSide || size % 2 === 0) {
    throw new RangeError(`a codeword side is an odd ${CODEWORD_LIMITS.minSide} to ${CODEWORD_LIMITS.maxSide} cells, not ${size}`);
  }
  if (!CODEWORD_BANDS.includes(difficulty)) throw new RangeError(`a codeword offers ${CODEWORD_BANDS.join(', ')}, not ${difficulty}`);
  const rules = CODEWORD_BAND_RULES[difficulty];
  const alphabet = [...list.alphabet];
  const index = fillIndex(list.words.slice(0, rules.vocabulary));

  for (let attempt = 0; attempt < FILL_ATTEMPTS; attempt++) {
    const random = createRandom(childSeed(seed, attempt));
    const white = codewordPattern(size, random);
    const slots = codewordSlots(size, white);
    const words = fillGrid(size, slots, index, random);
    if (!words) continue;

    const letters = new Array<string>(size * size).fill('');
    slots.forEach((slot, s) => [...words[s]].forEach((ch, p) => (letters[slot.cells[p]] = ch)));
    const used = alphabet.filter(ch => letters.includes(ch));
    const key = random.shuffle(used.slice());
    const numbers = letters.map(letter => (letter ? key.indexOf(letter) + 1 : 0));

    const givens = new Map<number, string>();
    let unique = false;
    while (!unique) {
      const result = solveCodeword(numbers, slots, givens, list.words, 2);
      if (result.count === null) break;
      if (result.count === 1) {
        unique = true;
        break;
      }
      const other = result.keys.find(k => k.some((letter, i) => letter !== key[i]));
      if (!other) break;
      const differ = key.map((_, i) => i + 1).filter(n => other[n - 1] !== key[n - 1]);
      const n = random.pick(differ);
      givens.set(n, key[n - 1]);
    }
    if (!unique) continue;
    const open = random.shuffle(key.map((_, i) => i + 1).filter(n => !givens.has(n)));
    while (givens.size < Math.min(rules.minGivens, key.length - 1) && open.length > 0) {
      const n = open.pop() as number;
      givens.set(n, key[n - 1]);
    }
    return {
      id: { game: 'codeword', size: `${size}${list.language.toUpperCase()}`, difficulty, seed },
      language: list.language,
      size,
      numbers,
      key,
      givens: [...givens.keys()].sort((a, b) => a - b),
      slots,
      words,
    };
  }
  throw new Error(`no ${size} x ${size} ${list.language} codeword from seed «${seed}» filled with one solution in ${FILL_ATTEMPTS} attempts`);
}

export const CODEWORD_FOOTER = {
  game: 'Codeword',
  rule: 'Each number stands for one letter. Fill the grid with words.',
} as const;
const DIFFICULTY_LABELS: Readonly<Record<string, string>> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
/** The key beside the grid: two columns of a number and a box, as shares of one entry's step. */
const KEY = { columns: 2, panelMm: 36, box: 0.78, text: 0.42, gap: 0.2 } as const;

export interface CodewordPageOptions {
  orientation: Orientation;
  hand: Hand;
  /** The cell preset; the largest that fits when absent. */
  cellMm?: CellPreset;
}

/** The key: each number with a box, its letter printed for a given. */
function drawKey(raster: Raster, layout: PageLayout, puzzle: Codeword): void {
  const panel = layout.sidePanel;
  if (!panel) throw new Error('a codeword page needs its key panel');
  const perColumn = Math.ceil(puzzle.key.length / KEY.columns);
  const columnWidth = Math.floor(panel.width / KEY.columns);
  const step = Math.min(Math.floor(panel.height / perColumn), Math.floor(columnWidth / 2));
  const box = Math.round(step * KEY.box);
  const textSize = Math.round(step * KEY.text);
  puzzle.key.forEach((letter, i) => {
    const column = Math.floor(i / perColumn);
    const x = panel.x + column * columnWidth;
    const y = panel.y + (i % perColumn) * step;
    const boxX = x + columnWidth - box - Math.round(step * KEY.gap);
    drawCentredText(raster, String(i + 1), x + Math.round((boxX - x) / 2), y + box / 2, { size: textSize, weight: FONT_WEIGHTS.regular, tone: 'ink' });
    const w = LINE_PX.grid;
    fillRect(raster, boxX, y, box, w, 'line');
    fillRect(raster, boxX, y + box - w, box, w, 'line');
    fillRect(raster, boxX, y, w, box, 'line');
    fillRect(raster, boxX + box - w, y, w, box, 'line');
    if (puzzle.givens.includes(i + 1)) drawCentredText(raster, letter, boxX + box / 2, y + box / 2, { size: textSize, weight: FONT_WEIGHTS.bold, tone: 'ink' });
  });
}

/** The page: the grid with its blocks, each cell's number, the given letters, the key and the footer. */
export function drawCodewordPage(puzzle: Codeword, options: CodewordPageOptions): { layout: PageLayout; raster: Raster } {
  const spec = { orientation: options.orientation, hand: options.hand, lattice: 'square', columns: puzzle.size, rows: puzzle.size, sidePanelMm: KEY.panelMm } as const;
  const layout = layoutPage({ ...spec, cellMm: options.cellMm ?? fitCellMm(spec) });
  const raster = createPage(layout);
  const { grid } = layout;
  puzzle.numbers.forEach((n, i) => {
    if (n === 0) fillRect(raster, grid.x + (i % puzzle.size) * grid.cell, grid.y + Math.floor(i / puzzle.size) * grid.cell, grid.cell, grid.cell, 'ink');
  });
  drawSquareLattice(raster, grid);
  puzzle.numbers.forEach((n, i) => {
    if (n === 0) return;
    const column = i % puzzle.size;
    const row = Math.floor(i / puzzle.size);
    drawCellText(raster, grid, column, row, String(n), 'clue');
    if (puzzle.givens.includes(n)) drawCellText(raster, grid, column, row, puzzle.key[n - 1], 'given');
  });
  drawKey(raster, layout, puzzle);
  drawFooter(raster, layout, { ...CODEWORD_FOOTER, difficulty: DIFFICULTY_LABELS[puzzle.id.difficulty], code: puzzleCode(puzzle.id) });
  return { layout, raster };
}

/** Each white cell the player fills, with its letter: the cells of a given number are printed, never checked. */
export function codewordAnswers(puzzle: Codeword): Map<number, string> {
  const answers = new Map<number, string>();
  puzzle.numbers.forEach((n, i) => {
    if (n > 0 && !puzzle.givens.includes(n)) answers.set(i, puzzle.key[n - 1]);
  });
  return answers;
}

/** «Check»: reads the player's letters from the page's strokes and names the wrong cells. */
export async function checkCodeword<E>(puzzle: Codeword, grid: Grid, strokes: readonly InkStroke<E>[], recognize: Recognize<E>): Promise<CheckResult> {
  const answers = codewordAnswers(puzzle);
  const reads = await readCells(grid, strokes, [...answers.keys()], recognize, 'letter');
  return checkCells(answers, reads, 'letter');
}
