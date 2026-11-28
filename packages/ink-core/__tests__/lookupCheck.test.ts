/** What a lookup may use from a lasso read (#165, #166), over the answers recorded on the tablet. */
import {checkLookup, lookupWords, rectProblem, type LassoQuery} from '../src';

/** The Nomad's page, in page pixels (docs/supernote.md, official specs only). */
const NOMAD = {width: 1404, height: 1872};
/** `getLassoRect` for a pasted sticker shown near (870, 1190) (#165, 2026-11-16). */
const PASTED = {left: -40, top: 0, right: 140, bottom: 181};
/** `getLassoRect` for a pasted sticker at the Manta's page centre (#165, device round 6, 2026-11-26). */
const PASTED_AT_CORNER = {left: 0, top: 0, right: 214, bottom: 180};
/** A synthetic page read like that round's, in page pixels: the word «cat» near (500, 600), the sticker. */
const PAGE_ELEMENTS = [
  {left: 500, top: 560, right: 640, bottom: 620},
  {left: 595, top: 830, right: 809, bottom: 1010},
];
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

  it('refuses a local rect with no negative side that touches no element of the page (#165)', () => {
    expect(rectProblem(PASTED_AT_CORNER, NOMAD, PAGE_ELEMENTS)).toMatch(/touches no element/);
  });

  it('keeps a rect over its own elements, one sharing an edge, and any rect with no page read', () => {
    const lassoed = {left: 490, top: 550, right: 650, bottom: 630};
    expect(rectProblem(lassoed, NOMAD, PAGE_ELEMENTS)).toBeNull();
    expect(rectProblem({left: 400, top: 500, right: 500, bottom: 560}, NOMAD, PAGE_ELEMENTS)).toBeNull();
    expect(rectProblem(PASTED_AT_CORNER, NOMAD)).toBeNull();
    expect(rectProblem(PASTED_AT_CORNER, NOMAD, [])).toBeNull();
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

  it('stops a pasted rect with no negative side once the page read shows it touches nothing (#165)', () => {
    const pasted = {
      ...word,
      place: {...word.place!, rect: PASTED_AT_CORNER, occupied: PAGE_ELEMENTS},
    };
    expect(checkLookup(pasted)).toMatchObject({ok: false, why: 'unplaced', place: null});
  });

  it('stops a word under the page bar with its own reason, a word above it and a pasted rect as before (#577)', () => {
    const MANTA = {width: 1920, height: 2560};
    const at = (top: number, bottom: number) => ({
      ...word,
      place: {...word.place!, rect: {left: 372, top, right: 572, bottom}, pageSize: MANTA},
    });
    for (const [top, bottom] of [[2460, 2532], [2440, 2540], [2440, 2560]]) {
      expect(checkLookup(at(top, bottom))).toMatchObject({ok: false, why: 'underBar', place: null});
    }
    expect(checkLookup(at(2362, 2402))).toMatchObject({ok: true});
    const pasted = {...word, place: {...word.place!, rect: PASTED, pageSize: MANTA}};
    expect(checkLookup(pasted)).toMatchObject({ok: false, why: 'unplaced'});
  });

  it('stops every word in the page\'s lowest 100 px as under the bar, its padded rect past the page too (#589)', () => {
    const MANTA = {width: 1920, height: 2560};
    // The lasso pads the ink by about 70 px each side (tablet row 139: ink 2472-2512, rect 2403-2583).
    const lasso = (inkTop: number, inkBottom: number) => ({
      ...word,
      place: {...word.place!, rect: {left: 882, top: inkTop - 69, right: 1062, bottom: inkBottom + 71}, pageSize: MANTA},
    });
    for (let inkTop = 2460; inkTop <= 2530; inkTop += 10) {
      expect(checkLookup(lasso(inkTop, inkTop + 30))).toMatchObject({ok: false, why: 'underBar', place: null});
    }
    expect(checkLookup(lasso(2472, 2512))).toMatchObject({ok: false, why: 'underBar'});
    // Just above the bar (ink 2424-2454) the definition still goes in.
    expect(checkLookup(lasso(2424, 2454))).toMatchObject({ok: true});
    // A rect that starts past the page or passes its right side is no lasso on the page.
    const off = {...word, place: {...word.place!, rect: {left: 1800, top: 2470, right: 1990, bottom: 2600}, pageSize: MANTA}};
    expect(checkLookup(off)).toMatchObject({ok: false, why: 'unplaced'});
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
