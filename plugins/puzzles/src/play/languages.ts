/**
 * A word game's language choice (#398): every language puzzle-core offers, each greyed out with
 * its reason when it cannot be played, from the word lists the plugin bundles. The languages and
 * their reasons are puzzle-core's (`wordLanguageOffers`), never a list written here.
 */
import {wordLanguageOffers, type WordLanguage, type WordList} from '@ink-tools/puzzle-core';
import {WORD_LISTS} from '@ink-tools/puzzle-core/src/words-data';
import {playCopy} from './copy';
import type {PuzzleOption} from './puzzle';

/** The word lists the games read: today the bundled ones, later the installed packs (#503). */
export const LISTS: Partial<Record<WordLanguage, WordList>> = WORD_LISTS;

/** The language option of a word game whose lists are `lists`. */
export function languageOption(lists: Partial<Record<WordLanguage, Pick<WordList, 'alphabet'>>> = LISTS): PuzzleOption {
  const offers = wordLanguageOffers(lists);
  const first = offers.find(offer => offer.unavailable === undefined) ?? offers[0];
  return {
    id: 'language',
    title: playCopy.language,
    choices: offers.map(offer => ({value: offer.language, label: offer.name, ...(offer.unavailable === undefined ? {} : {unavailable: offer.unavailable})})),
    initial: first.language,
  };
}

/** The word list of the language `choices` names; a language with none cannot be chosen. */
export function listOf(language: string, lists: Partial<Record<WordLanguage, WordList>> = LISTS): WordList {
  const list = lists[language as WordLanguage];
  if (!list) {
    throw new RangeError(`no word list for «${language}»`);
  }
  return list;
}
