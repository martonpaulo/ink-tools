/**
 * All five word lists, bundled (#381). Not exported from `index.ts`: only a caller that needs the
 * words imports this file, so the generators alone stay small.
 */
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
