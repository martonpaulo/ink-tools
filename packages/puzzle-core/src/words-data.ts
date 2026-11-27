/**
 * All five word lists, bundled (#381), and each language's avoid list for a word search's filler
 * (#385). Not exported from `index.ts`: only a caller that needs the
 * words imports this file, so the generators alone stay small.
 */
import avoid from '../words/avoid.json';
import de from '../words/de.json';
import en from '../words/en.json';
import es from '../words/es.json';
import fr from '../words/fr.json';
import pt from '../words/pt.json';
import type { WordLanguage, WordList } from './words';

export const WORD_LISTS: Readonly<Record<WordLanguage, WordList>> = {
  en: en as WordList,
  pt: pt as WordList,
  es: es as WordList,
  de: de as WordList,
  fr: fr as WordList,
};

/** Per language, the offensive words a word search's filler letters must never spell (#385). */
export const WORD_AVOID: Readonly<Record<WordLanguage, readonly string[]>> = avoid.words;
