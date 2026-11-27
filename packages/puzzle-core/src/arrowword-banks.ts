/**
 * The arrowword clue banks of the five languages (#454), bundled from `clues/arrowword-<lang>.json`
 * beside the crossword's banks (#400). Not exported from `index.ts`, like the word lists: only a
 * caller that draws an arrowword imports this file.
 *
 * Each bank's words come from its language's word list, 2 to 6 letters, and each clue is our own
 * short text. A bank ships only after the owner has reviewed its clues: until then its file says
 * `reviewed: false` and `reviewedClueBank` gives null, so the tests run over it but no player sees it.
 */
import de from '../clues/arrowword-de.json';
import en from '../clues/arrowword-en.json';
import es from '../clues/arrowword-es.json';
import fr from '../clues/arrowword-fr.json';
import pt from '../clues/arrowword-pt.json';
import { type ClueBank, type ClueEntry } from './arrowword';
import { pageText } from './page/font';
import { type WordLanguage, type WordList } from './words';
import { WORD_LISTS } from './words-data';

/** One bank file: the alphabet is the word list's, never stored twice. */
export interface ArrowwordBankFile {
  language: WordLanguage;
  /** The ids in `words/sources.json` of the clue text. */
  sources: string[];
  /** True only once the owner has reviewed every clue. */
  reviewed: boolean;
  entries: ClueEntry[];
}

export const ARROWWORD_BANK_FILES: Readonly<Record<WordLanguage, ArrowwordBankFile>> = {
  en: en as ArrowwordBankFile,
  pt: pt as ArrowwordBankFile,
  es: es as ArrowwordBankFile,
  de: de as ArrowwordBankFile,
  fr: fr as ArrowwordBankFile,
};

/** The bank in the generator's shape, reviewed or not: for the tests and the review. */
export function arrowwordBank(file: ArrowwordBankFile, list: Pick<WordList, 'alphabet'> = WORD_LISTS[file.language]): ClueBank {
  return { language: file.language, alphabet: list.alphabet, entries: file.entries };
}

/** The language's bank for a player, or null while the owner has not reviewed its clues. */
export function reviewedClueBank(language: WordLanguage): ClueBank | null {
  const file = ARROWWORD_BANK_FILES[language];
  return file.reviewed ? arrowwordBank(file) : null;
}

/** The clue's words in grid letters: folded, upper case, split at every other character. */
function clueWords(clue: string): string[] {
  return pageText(clue.toUpperCase()).split(/[^A-ZÑ]+/).filter(Boolean);
}

/**
 * What keeps a bank from shipping: a word missing from the language's word list, a word twice, an
 * empty clue, a clue that holds its own answer as one of its words, or a letter outside the
 * alphabet. An empty answer means every entry is sound.
 */
export function clueBankProblems(file: ArrowwordBankFile, list: Pick<WordList, 'language' | 'alphabet' | 'words'>): string[] {
  const problems: string[] = [];
  if (file.language !== list.language) problems.push(`the ${file.language} bank is checked against the ${list.language} list`);
  const known = new Set(list.words);
  const seen = new Set<string>();
  for (const { word, clue } of file.entries) {
    const stray = [...word].find(ch => !list.alphabet.includes(ch));
    if (stray) problems.push(`«${word}» has «${stray}», which is not in the alphabet`);
    if (!known.has(word)) problems.push(`«${word}» is not in the ${list.language} word list`);
    if (seen.has(word)) problems.push(`«${word}» is in the bank twice`);
    seen.add(word);
    if (clue.trim() === '') problems.push(`«${word}» has an empty clue`);
    else if (clueWords(clue).includes(word)) problems.push(`«${word}»'s clue «${clue}» holds the answer`);
  }
  return problems;
}
