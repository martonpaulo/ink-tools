/**
 * All five clue banks of the crossword (#400), bundled. Not exported from `index.ts`, like the
 * word lists: only a caller that draws a crossword imports this file.
 */
import de from '../clues/de.json';
import en from '../clues/en.json';
import es from '../clues/es.json';
import fr from '../clues/fr.json';
import pt from '../clues/pt.json';
import type { ClueBank } from './crossword';
import type { WordLanguage } from './words';

export const CLUE_BANKS: Readonly<Record<WordLanguage, ClueBank>> = {
  en: en as ClueBank,
  pt: pt as ClueBank,
  es: es as ClueBank,
  de: de as ClueBank,
  fr: fr as ClueBank,
};
