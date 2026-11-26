/**
 * A synthetic clue bank for the arrowword tests (#401): the most frequent words of a language's
 * list, each clued by itself with every second letter hidden («GATO» is «G·T·»). Such clues are
 * often shared (GATO and GATA), so the solver must use the crossings to prove one solution. The
 * real clue bank is written by us and reviewed; these clues are never shipped.
 */
import { type ClueBank } from '../src/arrowword';
import { type WordLanguage } from '../src/words';
import { WORD_LISTS } from '../src/words-data';

/** How many of the most frequent words the test bank takes. */
export const TEST_BANK_WORDS = 3000;

export function maskedClue(word: string): string {
  return [...word].map((ch, i) => (i % 2 === 1 ? '·' : ch)).join('');
}

export function maskedClueBank(language: WordLanguage, size = TEST_BANK_WORDS): ClueBank {
  const list = WORD_LISTS[language];
  const words = list.words.filter(word => word.length >= 2).slice(0, size);
  return { language, alphabet: list.alphabet, entries: words.map(word => ({ word, clue: maskedClue(word) })) };
}
