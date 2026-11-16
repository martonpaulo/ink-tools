import {LANGUAGES} from '../src/dictionary';
import {ALL_DIRECTIONS, directionId, PAIRS} from '../src/pairs';

test('the pairs are PT with ES and PT with ZH, each id unique and of two known languages', () => {
  expect(PAIRS.map(p => p.id)).toEqual(['es-pt', 'zh-pt']);
  expect(new Set(PAIRS.map(p => p.id)).size).toBe(PAIRS.length);
  for (const {languages: [a, b]} of PAIRS) {
    expect(LANGUAGES).toContain(a);
    expect(LANGUAGES).toContain(b);
    expect(a).not.toBe(b);
  }
});

test('every direction of every pair, both ways, in PAIRS order, each with its own id (#174)', () => {
  expect(ALL_DIRECTIONS.map(directionId)).toEqual(['es-pt', 'pt-es', 'zh-pt', 'pt-zh']);
});
