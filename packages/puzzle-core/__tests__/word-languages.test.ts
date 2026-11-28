/** A word game's languages (#398): each offered, greyed out with its reason when it cannot be played, and a fill-in from its code. */
import { fillInFromCode, generateFillIn, languageOfToken, puzzleCode, wordLanguageOffers, WORD_LANGUAGES } from '../src';
import { WORD_LISTS } from '../src/words-data';

describe('wordLanguageOffers', () => {
  it('offers every bundled language, none greyed out', () => {
    expect(wordLanguageOffers(WORD_LISTS).map(offer => [offer.language, offer.unavailable])).toEqual(WORD_LANGUAGES.map(language => [language, undefined]));
  });

  it('greys out a language with no list, and one whose letters the page font lacks', () => {
    const offers = wordLanguageOffers({ en: WORD_LISTS.en, fr: { alphabet: 'ABCŒ' } });
    expect(offers.find(offer => offer.language === 'pt')?.unavailable).toBe('No word list is installed');
    expect(offers.find(offer => offer.language === 'fr')?.unavailable).toBe('The page font lacks Œ');
    expect(offers.find(offer => offer.language === 'en')?.unavailable).toBeUndefined();
  });
});

describe('languageOfToken', () => {
  it.each([['EN', 'en'], ['13PT', 'pt'], ['9', null], ['XX', null]])('reads %s as %p', (token, language) => {
    expect(languageOfToken(token)).toBe(language);
  });
});

describe('fillInFromCode', () => {
  it('makes the same fill-in again from its code', () => {
    const puzzle = generateFillIn('7K2Q9X', 'medium', WORD_LISTS.es);
    expect(fillInFromCode(puzzleCode(puzzle.id), WORD_LISTS)).toEqual(puzzle);
  });

  it('refuses a code of another game, or of a language with no list', () => {
    expect(() => fillInFromCode('HI-5-E-7K2Q9X', WORD_LISTS)).toThrow('not a fill-in code');
    expect(() => fillInFromCode('FI-DE-E-7K2Q9X', { en: WORD_LISTS.en })).toThrow('not installed');
  });
});
