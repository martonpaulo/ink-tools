/**
 * Read the digits or letters a player wrote in a grid, and compare them with the solution (#382).
 *
 * The method is the one the digit probe chose (#378, device round 11): one recognition call per
 * grid row, about 0.85 s, against 0.44 s per cell, and the row call read all nine digits right.
 * A row call answers one string with spaces the recogniser chooses, so the answer goes back to the
 * row's cells by position only when it counts them exactly; otherwise that row is read cell by cell.
 * A cell that gives no text is `unread`, never `wrong`, so «Check» raises no false alarm.
 *
 * The recogniser is the host's (`recognizeElements` on the tablet), passed in as a port.
 */
import { cellCenter, type Grid } from '../page/grid';
import { strokesByCell, type InkStroke } from './cells';

/** The recogniser's answer: its text, null when it found none, or the failure. */
export type ReadText = { ok: true; text: string | null } | { ok: false; message: string };
export type Recognize<E> = (elements: E[]) => Promise<ReadText>;

/**
 * What a cell holds: one digit, a number of one or more digits (a 16 x 16 sudoku's 12), or one
 * letter of any language.
 */
export type Alphabet = 'digit' | 'number' | 'letter';

export type CellRead =
  | { readonly index: number; readonly status: 'empty' }
  | { readonly index: number; readonly status: 'read'; readonly text: string }
  | { readonly index: number; readonly status: 'unread'; readonly reason: string };

export interface CheckResult {
  readonly wrong: number[];
  readonly right: number[];
  readonly empty: number[];
  readonly unread: { index: number; reason: string }[];
}

/**
 * [inference] the misreads the recogniser makes between digits and letters, folded towards what
 * the cell holds. Round 8 (#378) read G and Q as 9, I as «.» and L as I; capitals came back lower case.
 */
const AS_DIGIT: Readonly<Record<string, string>> = { O: '0', I: '1', L: '1', '|': '1', Z: '2', S: '5', B: '8', G: '9', Q: '9' };
const AS_LETTER: Readonly<Record<string, string>> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '9': 'G' };
const VALID: Readonly<Record<Alphabet, RegExp>> = { digit: /^[0-9]$/, number: /^[0-9]+$/, letter: /^\p{L}$/u };
const SINGLE: Readonly<Record<Alphabet, boolean>> = { digit: true, number: false, letter: true };

/**
 * The text as the alphabet reads it: trimmed, upper case, inner spaces dropped and the usual
 * misreads folded; null when it is still not a value of the alphabet.
 */
export function normalizeRead(text: string, alphabet: Alphabet): string | null {
  const fold = alphabet === 'letter' ? AS_LETTER : AS_DIGIT;
  const value = [...text.replace(/\s+/g, '').toUpperCase()].map(ch => fold[ch] ?? ch).join('');
  return VALID[alphabet].test(value) ? value : null;
}

async function call<E>(recognize: Recognize<E>, elements: E[]): Promise<ReadText> {
  try {
    return await recognize(elements);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function readOf(index: number, raw: string, alphabet: Alphabet): CellRead {
  const text = normalizeRead(raw, alphabet);
  return text === null ? { index, status: 'unread', reason: `read «${raw}», not a ${alphabet}` } : { index, status: 'read', text };
}

/**
 * The row's answer split into one piece per inked cell, in order, or null when it does not count
 * them: whitespace tokens first, then, for one symbol per cell, single characters.
 */
function splitRow(text: string, count: number, alphabet: Alphabet): string[] | null {
  const tokens = text.trim().split(/\s+/).filter(token => token.length > 0);
  const single = SINGLE[alphabet];
  if (tokens.length === count && (!single || tokens.every(token => [...token].length === 1))) return tokens;
  const characters = [...text.replace(/\s+/g, '')];
  return single && characters.length === count ? characters : null;
}

async function readCell<E>(index: number, strokes: readonly InkStroke<E>[], recognize: Recognize<E>, alphabet: Alphabet): Promise<CellRead> {
  const answer = await call(recognize, strokes.map(stroke => stroke.element));
  if (!answer.ok) return { index, status: 'unread', reason: answer.message };
  if (answer.text === null || answer.text.trim() === '') return { index, status: 'unread', reason: 'no text' };
  return readOf(index, answer.text, alphabet);
}

/**
 * Reads the given cells of the grid from the page's strokes, one call per row with ink, and a call
 * per cell for a row whose answer does not count its inked cells. Answers one read per given cell,
 * in the given order; a cell with no ink is `empty` and costs no call.
 */
export async function readCells<E>(
  grid: Grid,
  strokes: readonly InkStroke<E>[],
  cells: readonly number[],
  recognize: Recognize<E>,
  alphabet: Alphabet,
): Promise<CellRead[]> {
  const byCell = strokesByCell(grid, strokes);
  const reads = new Map<number, CellRead>();
  const rows = new Map<number, number[]>();
  for (const index of new Set(cells)) {
    if (!byCell.has(index)) {
      reads.set(index, { index, status: 'empty' });
      continue;
    }
    const row = Math.floor(index / grid.columns);
    const list = rows.get(row);
    if (list) list.push(index);
    else rows.set(row, [index]);
  }
  const x = (index: number): number => cellCenter(grid, index % grid.columns, Math.floor(index / grid.columns))[0];
  for (const inked of rows.values()) {
    inked.sort((a, b) => x(a) - x(b));
    const answer = await call(
      recognize,
      inked.flatMap(index => (byCell.get(index) ?? []).map(stroke => stroke.element)),
    );
    const pieces = answer.ok && answer.text !== null ? splitRow(answer.text, inked.length, alphabet) : null;
    if (pieces) {
      inked.forEach((index, i) => reads.set(index, readOf(index, pieces[i], alphabet)));
      continue;
    }
    for (const index of inked) reads.set(index, await readCell(index, byCell.get(index) ?? [], recognize, alphabet));
  }
  return cells.map(index => reads.get(index) as CellRead);
}

/**
 * Compares the reads with the solution's values, for the cells the player fills only: a given
 * cell's printed clue is not in `expected` and is never checked. A cell with no read is unread.
 */
export function checkCells(expected: ReadonlyMap<number, string>, reads: readonly CellRead[], alphabet: Alphabet): CheckResult {
  const byIndex = new Map(reads.map(read => [read.index, read]));
  const result: CheckResult = { wrong: [], right: [], empty: [], unread: [] };
  for (const [index, value] of expected) {
    const want = normalizeRead(value, alphabet);
    if (want === null) throw new Error(`cell ${index} expects «${value}», which is not a ${alphabet}`);
    const read = byIndex.get(index);
    if (!read) result.unread.push({ index, reason: 'not read' });
    else if (read.status === 'empty') result.empty.push(index);
    else if (read.status === 'unread') result.unread.push({ index, reason: read.reason });
    else (read.text === want ? result.right : result.wrong).push(index);
  }
  return result;
}
