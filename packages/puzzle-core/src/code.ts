/**
 * The short code that names one puzzle (#380): game, size, band and seed, so a puzzle can be
 * shared, typed back and regenerated, and a daily puzzle is seeded by the date.
 *
 *   SU-9-H-7K2Q9X   sudoku, 9 x 9, hard, seed 7K2Q9X
 */

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const GAMES = ['sudoku', 'jigsaw-sudoku', 'nonogram', 'maze', 'word-search'] as const;
export type Game = (typeof GAMES)[number];

const GAME_CODES: Record<Game, string> = { sudoku: 'SU', 'jigsaw-sudoku': 'JS', nonogram: 'NO', maze: 'MZ', 'word-search': 'WS' };
const BAND_CODES: Record<Difficulty, string> = { easy: 'E', medium: 'M', hard: 'H', expert: 'X' };

/** Crockford's base 32: no I, L, O or U, so a hand-copied code is not misread. */
const SEED_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SEED = /^[0-9A-HJKMNP-TV-Z]{1,16}$/;
const SIZE = /^[0-9A-Z]{1,8}$/;
const CODE_PARTS = 4;

export interface PuzzleId {
  game: Game;
  /** The game's size token: `9` for a sudoku, `10X15` for a nonogram, `C12` for a circular maze. */
  size: string;
  difficulty: Difficulty;
  seed: string;
}

export function puzzleCode(id: PuzzleId): string {
  const size = id.size.toUpperCase();
  if (!SIZE.test(size)) throw new RangeError(`size «${id.size}» is not 1 to 8 letters or digits`);
  if (!SEED.test(id.seed)) throw new RangeError(`seed «${id.seed}» is not 1 to 16 base-32 characters`);
  return `${GAME_CODES[id.game]}-${size}-${BAND_CODES[id.difficulty]}-${id.seed}`;
}

/** The id a code names, or an error saying which part is wrong. Case and spaces are forgiven. */
export function parsePuzzleCode(code: string): PuzzleId {
  const parts = code.trim().toUpperCase().split('-');
  if (parts.length !== CODE_PARTS) throw new RangeError(`«${code}» is not GAME-SIZE-BAND-SEED`);
  const [gameCode, size, bandCode, seed] = parts;
  const game = GAMES.find(g => GAME_CODES[g] === gameCode);
  if (!game) throw new RangeError(`«${gameCode}» is not a game code`);
  const difficulty = DIFFICULTIES.find(d => BAND_CODES[d] === bandCode);
  if (!difficulty) throw new RangeError(`«${bandCode}» is not a difficulty code`);
  if (!SIZE.test(size)) throw new RangeError(`«${size}» is not a size`);
  if (!SEED.test(seed)) throw new RangeError(`«${seed}» is not a seed`);
  return { game, size, difficulty, seed };
}

/** A seed in the code's alphabet from a non-negative integer, such as a clock or a counter. */
export function seedFromNumber(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${value} is not a non-negative integer`);
  let n = value;
  let out = '';
  do {
    out = SEED_ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  } while (n > 0);
  return out;
}

/** The seed of the daily puzzle of a calendar date, `YYYY-MM-DD`: the same for everyone that day. */
export function dailySeed(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`«${date}» is not YYYY-MM-DD`);
  return `D${match[1]}${match[2]}${match[3]}`;
}
