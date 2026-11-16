import {answerKept, selfCrossings, strokeKept, wordKept} from '../src/shapes';
import type {Word} from '../src/words';
import {letter, scribble, stroke} from '../test-support/ink';

const wordOf = (strokes = [letter(0), letter(30)], letterHeight = 40): Word => ({
  strokes,
  rect: {left: 0, top: 100, right: 50, bottom: 140},
  letterHeight,
});

test('an ordinary word goes on to recognition', () => {
  expect(wordKept(wordOf())).toBeNull();
  expect(answerKept('café', wordOf())).toBeNull();
});

test('a stroke far taller than the letters stays handwriting', () => {
  expect(strokeKept(stroke(0, 0, 30, 120), 40)).toBe('tall');
  expect(strokeKept(stroke(0, 60, 20, 80), 40)).toBeNull(); // an «l» is twice the x-height
});

test('an underline or an arrow shaft stays handwriting', () => {
  expect(strokeKept(stroke(0, 140, 400, 6), 40)).toBe('long');
  expect(strokeKept(stroke(0, 100, 100, 10), 40)).toBeNull(); // a dash in a word
});

test('a scribble stays handwriting', () => {
  const spiral = scribble(0, 100);
  expect(selfCrossings(spiral.points)).toBeGreaterThanOrEqual(8);
  expect(strokeKept(spiral, 40)).toBe('scribble');
  expect(selfCrossings(letter(0).points)).toBe(0);
});

test('one kept stroke keeps the whole word', () => {
  expect(wordKept(wordOf([letter(0), stroke(30, 0, 30, 200)]))).toBe('tall');
});

test('very large writing is a drawing', () => {
  expect(wordKept(wordOf([stroke(0, 0, 300, 300)], 300))).toBe('large');
});

test('an answer that is not a word keeps the strokes', () => {
  expect(answerKept('  ', wordOf())).toBe('empty');
  expect(answerKept('→ —', wordOf())).toBe('no letter');
  // A circle read as «O»: one character for ink wider than two letter heights.
  const circle = {...wordOf(), rect: {left: 0, top: 0, right: 200, bottom: 200}};
  expect(answerKept('O', circle)).toBe('one character');
  expect(answerKept('a', wordOf())).toBeNull();
});

test('a tall letter with an accent is still a word («lá»)', () => {
  const word = wordOf([stroke(0, 60, 20, 80), letter(30), stroke(32, 85, 10, 10)], 40);
  expect(wordKept(word)).toBeNull();
});
