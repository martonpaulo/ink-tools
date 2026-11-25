/** What a lookup may use from a lasso read (#165, #166), over the answers recorded on the tablet. */
import {checkLookup, lookupWords, rectProblem, type LassoQuery} from '../src';

/** The Nomad's page, in page pixels (docs/supernote.md, official specs only). */
const NOMAD = {width: 1404, height: 1872};
/** `getLassoRect` for a pasted sticker shown near (870, 1190) (#165, 2026-11-16). */
const PASTED = {left: -40, top: 0, right: 140, bottom: 181};
/** A lassoed sticker drawing, recognized by `recognizeElements` (#166, 2026-11-16). */
const STICKER_TEXT = '• :.\n÷\n÷:.\n.\n.';

const word: LassoQuery = {
  query: 'apple',
  place: {rect: {left: 372, top: 300, right: 572, bottom: 380}, page: 0, pageSize: NOMAD},
};

describe('lookupWords (#166)', () => {
  it('finds no word in the recorded sticker text', () => {
    expect(lookupWords(STICKER_TEXT)).toBeNull();
    expect(lookupWords(' 3 ÷ 4 ')).toBeNull();
  });

  it('reduces a multi-line recognition to its words, any script', () => {
    expect(lookupWords('apple\npie')).toBe('apple pie');
    expect(lookupWords('«maçã»,\n÷')).toBe('maçã');
    expect(lookupWords("l'eau well-known")).toBe("l'eau well-known");
    expect(lookupWords('苹果')).toBe('苹果');
  });
});

describe('rectProblem (#165)', () => {
  it('refuses the recorded pasted rect, an empty rect and one past the page', () => {
    expect(rectProblem(PASTED, NOMAD)).toMatch(/negative side/);
    expect(rectProblem({left: 10, top: 10, right: 10, bottom: 40}, NOMAD)).toMatch(/empty/);
    expect(rectProblem({left: 1300, top: 10, right: 1500, bottom: 40}, NOMAD)).toMatch(
      /past the page/,
    );
  });

  it('keeps a rect on the page', () => {
    expect(rectProblem(word.place!.rect, NOMAD)).toBeNull();
  });
});

describe('checkLookup', () => {
  it('keeps a word on the page, reduced to its words', () => {
    expect(checkLookup({...word, query: 'apple\n.'})).toEqual({ok: true, value: word});
  });

  it('stops a pasted selection before anything is placed, with no place for a note (#165)', () => {
    const pasted = {...word, place: {...word.place!, rect: PASTED}};
    expect(checkLookup(pasted)).toMatchObject({ok: false, why: 'unplaced', place: null});
  });

  it('stops a recognition with no word, keeping the place for a note (#166)', () => {
    expect(checkLookup({...word, query: STICKER_TEXT})).toMatchObject({
      ok: false,
      why: 'unreadable',
      place: word.place,
    });
  });

  it('a read with no rect still gets its words, as before', () => {
    expect(checkLookup({query: ' soup ', place: null})).toEqual({
      ok: true,
      value: {query: 'soup', place: null},
    });
  });
});
