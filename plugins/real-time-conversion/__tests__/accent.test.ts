/**
 * «café» with its accent (#206): on the tablet the word was kept as «tall, 6 strokes». The strokes
 * here are the page bounds Probe read back from the owner's «café» on a 1920 x 2560 page: c, a, f,
 * the f's bar, e, and the accent over the e, 27 px over letters of 40 to 44 px.
 */
import {accentsOf, wordKept} from '../src/shapes';
import {DEFAULT_WORD_OPTIONS, InkStroke, Word, WordTracker} from '../src/words';

const CAFE: [string, number, number, number, number][] = [
  ['c', 929, 1304, 967, 1344],
  ['a', 973, 1299, 1015, 1343],
  ['f', 1031, 1267, 1063, 1342],
  ['bar', 1019, 1319, 1047, 1323],
  ['e', 1070, 1308, 1111, 1350],
  ['accent', 1088, 1269, 1112, 1296],
];

function strokeOf([id, left, top, right, bottom]: [string, number, number, number, number]): InkStroke {
  const points = [0, 1, 2, 3, 4].map(i => ({
    x: left + ((right - left) * i) / 4,
    y: i % 2 ? top : bottom,
  }));
  return {id, rect: {left, top, right, bottom}, points};
}

function written(strokes: InkStroke[]): Word[] {
  const tracker = new WordTracker(DEFAULT_WORD_OPTIONS);
  const words = strokes.flatMap((stroke, index) => tracker.add(stroke, index * 300));
  return [...words, ...tracker.tick(100_000)];
}

test('the accent over «café» joins its word, and the word goes on', () => {
  const words = written(CAFE.map(strokeOf));
  expect(words.map(word => word.strokes.map(stroke => stroke.id))).toEqual([
    ['c', 'a', 'f', 'bar', 'e', 'accent'],
  ]);
  // The accent is no letter: the line's letter height is the letters' own.
  expect(words[0].letterHeight).toBeGreaterThanOrEqual(40);
  expect(words[0].letterHeight).toBeLessThanOrEqual(44);
  expect(wordKept(words[0])).toBeNull();
});

test('the accent never counts toward the letter height an «f» is weighed against', () => {
  // The same «café», its f reaching below the line: 104 px, about 2.5 letters, as a cursive f is.
  const strokes = CAFE.map(strokeOf);
  strokes[2] = strokeOf(['f', 1031, 1267, 1063, 1371]);
  const word: Word = {
    strokes,
    rect: {left: 929, top: 1267, right: 1112, bottom: 1371},
    letterHeight: 43,
  };
  // Weighed against c, a and e (42 px), not pulled down to 41 px by the 27 px accent.
  expect(wordKept(word)).toBeNull();
  expect([...accentsOf(word)].map(stroke => stroke.id)).toEqual(['accent']);
});
