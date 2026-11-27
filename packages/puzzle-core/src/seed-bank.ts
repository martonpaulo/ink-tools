/**
 * A seed bank (#552): puzzles a generator too slow for the tablet made once on the Mac, each kept
 * with the seed it was made from, so a banked puzzle is the very puzzle its code names. A new page
 * of a banked size and band takes an entry the seed picks, ready at once, and its code carries the
 * entry's seed; any other code is made live, as before, so a page made before its pair was banked
 * still opens on its own puzzle. Written by `scripts/seed-bank.cjs`.
 *
 * shortcut: an entry is shown as it was made, never turned or relabelled as the sudoku banks are,
 * since a view would change the puzzle its code names; a pair offers its entries and no more.
 * Encode the view in the code if a player meets the same puzzle too often.
 */

import type { Difficulty } from './code';
import { childSeed, createRandom } from './random';

/** Entries by pair (`12:hard`, `10x10:hard`), each `SEED/TEXT`: the text is the game's own encoding. */
export type SeedBank = Readonly<Record<string, readonly string[]>>;

export interface SeedBankEntry {
  readonly seed: string;
  readonly text: string;
}

/** A bank's key: the size as the game writes it (`12`, `10x10`) and the band. */
export const bankPair = (size: string | number, difficulty: Difficulty): string => `${size}:${difficulty}`;

function entryOf(line: string): SeedBankEntry {
  const at = line.indexOf('/');
  return { seed: line.slice(0, at), text: line.slice(at + 1) };
}

/** The entry a new page of the pair shows, picked by the seed; null when the pair is not banked. */
export function pickFromBank(bank: SeedBank, pair: string, seed: string): SeedBankEntry | null {
  const lines = bank[pair];
  if (!lines?.length) return null;
  return entryOf(createRandom(childSeed(seed, 'bank')).pick(lines));
}

/** The entry made from exactly this seed, or null when the code names a puzzle made live. */
export function findInBank(bank: SeedBank, pair: string, seed: string): SeedBankEntry | null {
  const line = bank[pair]?.find(text => text.startsWith(`${seed}/`));
  return line ? entryOf(line) : null;
}
