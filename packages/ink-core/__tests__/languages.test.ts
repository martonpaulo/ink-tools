/** The TypeScript reader of the language registry runs the shared case table (#500). */
import cases from '../../../registry/languages/cases.json';
import {
  apertiumCode,
  foldToGrid,
  languageLabel,
  languageTag,
  pairId,
  tabletLocale,
  wikipediaCode,
  withoutAccents,
} from '../src/languages';

type Cases = {
  fold: {language: string; text: string; grid: string | null}[];
  accents: {text: string; plain: string}[];
  codes: {language: string; tag: string; tablet: string; wikipedia: string; apertium: string; label: string}[];
  pairs: {from: string; to: string; id: string}[];
};

const CASES: Cases = cases;

test.each(CASES.fold)('$language folds «$text» to $grid', ({language, text, grid}) => {
  expect(foldToGrid(text, language)).toBe(grid);
});

test.each(CASES.accents)('«$text» without accents is «$plain»', ({text, plain}) => {
  expect(withoutAccents(text)).toBe(plain);
});

test.each(CASES.codes)('$language has its outside codes', code => {
  expect(languageTag(code.language)).toBe(code.tag);
  expect(tabletLocale(code.language)).toBe(code.tablet);
  expect(wikipediaCode(code.language)).toBe(code.wikipedia);
  expect(apertiumCode(code.language)).toBe(code.apertium);
  expect(languageLabel(code.language)).toBe(code.label);
});

test.each(CASES.pairs)('$from to $to is the pair $id', ({from, to, id}) => {
  expect(pairId(from, to)).toBe(id);
});

test('a language outside the registry is named', () => {
  expect(() => foldToGrid('x', 'zz')).toThrow('zz: not in the language registry');
});
