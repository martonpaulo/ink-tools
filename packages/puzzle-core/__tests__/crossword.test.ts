import { CLUE_BANKS } from '../src/clues-data';
import { parsePuzzleCode, puzzleCode } from '../src/code';
import {
  CROSSWORD_GIVEN_SHARE,
  checkCrossword,
  countCrosswordSolutions,
  crosswordSizeToken,
  generateCrossword,
  parseCrosswordSize,
  type ClueBank,
  type Crossword,
} from '../src/crossword';
import { drawCrosswordPage, type CrosswordPageText } from '../src/crossword-page';
import { type InkStroke, type ReadText } from '../src/check';
import { FONT_WEIGHTS, measureText, pageText } from '../src/page/font';
import { cellCenter, type Grid } from '../src/page/grid';
import { layoutPage } from '../src/page/layout';
import { assertNativeGreys } from '../src/page/raster';
import { WORD_LISTS } from '../src/words-data';
import { WORD_LANGUAGES, gridPattern } from '../src/words';

const TEXT: CrosswordPageText = { game: 'Crossword', difficulty: 'Medium', rule: 'Write one letter in each white cell.', across: 'Across', down: 'Down' };

/** Every run of two or more letters in a line, as its letters, across then down. */
function runs(puzzle: Crossword): string[] {
  const { size, letters } = puzzle;
  const out: string[] = [];
  for (const across of [true, false]) {
    for (let line = 0; line < size; line++) {
      const text = Array.from({ length: size }, (_, i) => letters[across ? line * size + i : i * size + line] ?? ' ').join('');
      out.push(...text.split(' ').filter(word => word.length > 1));
    }
  }
  return out;
}

describe.each(WORD_LANGUAGES)('the %s clue bank', language => {
  const bank = CLUE_BANKS[language];

  test('holds well over a hundred answers from the word list, each once, in grid letters', () => {
    expect(bank.language).toBe(language);
    expect(bank.entries.length).toBeGreaterThan(130);
    const known = new Set(WORD_LISTS[language].words);
    expect(bank.entries.filter(entry => !known.has(entry.answer) || !gridPattern(language).test(entry.answer))).toEqual([]);
    expect(new Set(bank.entries.map(entry => entry.answer)).size).toBe(bank.entries.length);
  });

  test('every clue can be drawn by the page font', () => {
    for (const entry of bank.entries) expect(() => measureText(pageText(entry.clue), 40, FONT_WEIGHTS.regular)).not.toThrow();
  });

  test.each([5, 9, 13])('a crossword of side %i has one solution, and every run of letters is a clued answer', size => {
    const puzzle = generateCrossword('P1', size, 'medium', bank);
    expect(countCrosswordSolutions(puzzle, bank)).toBe(1);
    expect(puzzle.letters).toHaveLength(size * size);
    expect(runs(puzzle).sort()).toEqual(puzzle.slots.map(slot => slot.answer).sort());
    for (const slot of puzzle.slots) {
      expect(slot.cells.map(cell => puzzle.letters[cell]).join('')).toBe(slot.answer);
      expect(bank.entries).toContainEqual({ answer: slot.answer, clue: slot.clue });
    }
  });

  test('a 13 x 13 page fits the grid and its clues in portrait', () => {
    const page = drawCrosswordPage(generateCrossword('P1', 13, 'hard', bank), { orientation: 'portrait', hand: 'right' }, TEXT);
    expect(page.layout.belowPanel).not.toBeNull();
    assertNativeGreys(page.raster);
  });
});

describe('generateCrossword', () => {
  const bank = CLUE_BANKS.en;

  test('the same seed gives the same puzzle, another seed another one', () => {
    expect(generateCrossword('S', 11, 'easy', bank)).toEqual(generateCrossword('S', 11, 'easy', bank));
    expect(generateCrossword('S', 11, 'easy', bank).letters).not.toEqual(generateCrossword('T', 11, 'easy', bank).letters);
  });

  test.each(['easy', 'medium', 'hard'] as const)('%s prints its share of the letters as givens', band => {
    const puzzle = generateCrossword('G', 13, band, bank);
    const letters = puzzle.letters.filter(letter => letter !== null).length;
    expect(puzzle.givens.length).toBe(Math.round(letters * CROSSWORD_GIVEN_SHARE[band]));
  });

  test('numbers go in reading order and an across and a down slot that start together share one', () => {
    const puzzle = generateCrossword('N', 13, 'hard', bank);
    const starts = [...new Set(puzzle.slots.map(slot => slot.cells[0]))].sort((a, b) => a - b);
    for (const slot of puzzle.slots) expect(slot.number).toBe(starts.indexOf(slot.cells[0]) + 1);
  });

  test('the code names the side and the language, and reads back', () => {
    const puzzle = generateCrossword('7K2', 9, 'easy', CLUE_BANKS.pt);
    expect(puzzleCode(puzzle.id)).toBe('CW-9PT-E-7K2');
    expect(parseCrosswordSize(parsePuzzleCode('CW-9PT-E-7K2').size)).toEqual({ size: 9, language: 'pt' });
    expect(crosswordSizeToken(13, 'es')).toBe('13ES');
    expect(() => parseCrosswordSize('13IT')).toThrow('not a crossword size');
  });

  test.each([
    [4, 'easy', 'side is 5 to 13'],
    [14, 'easy', 'side is 5 to 13'],
    [9, 'expert', 'offers easy, medium, hard'],
  ] as const)('a side of %i at %s is refused: %s', (size, band, why) => {
    expect(() => generateCrossword('S', size, band, bank)).toThrow(why);
  });

  test('an answer outside the grid letters is refused', () => {
    expect(() => generateCrossword('S', 5, 'easy', { language: 'en', entries: [{ answer: 'CAFÉ', clue: 'x' }] })).toThrow('grid letters');
  });
});

describe('countCrosswordSolutions', () => {
  // Two answers of one length printed with the same clue: the grid alone cannot tell them apart.
  const bank: ClueBank = {
    language: 'en',
    entries: [
      { answer: 'CAT', clue: 'Pet' },
      { answer: 'DOG', clue: 'Pet' },
      { answer: 'COW', clue: 'Farm animal' },
    ],
  };
  const lone = { size: 5, letters: ['C', 'A', 'T', ...new Array<null>(22).fill(null)], givens: [], slots: [{ number: 1, direction: 'across' as const, answer: 'CAT', clue: 'Pet', cells: [0, 1, 2] }] };

  test('a clue with two answers of the slot’s length gives two solutions', () => {
    expect(countCrosswordSolutions(lone, bank)).toBe(2);
  });

  test('a given letter settles it', () => {
    expect(countCrosswordSolutions({ ...lone, givens: [1] }, bank)).toBe(1);
  });

  test('a crossing settles it: only CAT shares its C with COW', () => {
    const letters = new Array<string | null>(25).fill(null);
    ['C', 'A', 'T'].forEach((ch, i) => (letters[i] = ch));
    letters[5] = 'O';
    letters[10] = 'W';
    const crossed = {
      ...lone,
      letters,
      slots: [...lone.slots, { number: 1, direction: 'down' as const, answer: 'COW', clue: 'Farm animal', cells: [0, 5, 10] }],
    };
    expect(countCrosswordSolutions(crossed, bank)).toBe(1);
  });
});

describe('checkCrossword', () => {
  type Tag = { cell: number; letter: string };
  const puzzle = generateCrossword('C1', 7, 'medium', CLUE_BANKS.fr);
  const layout = layoutPage({ orientation: 'portrait', hand: 'right', cellMm: 10, lattice: 'square', columns: 7, rows: 7 });

  /** One short stroke in the middle of the cell, standing for the letter written there. */
  const written = (grid: Grid, cell: number, letter: string): InkStroke<Tag> => {
    const [x, y] = cellCenter(grid, cell % 7, Math.floor(cell / 7));
    return { points: [{ x: x - 10, y }, { x: x + 10, y: y + 10 }], element: { cell, letter } };
  };
  /** Reads each written letter back, spaced, as the tablet's recogniser answers a row. */
  const recognize = async (elements: Tag[]): Promise<ReadText> => ({ ok: true, text: elements.map(tag => tag.letter).join(' ') });

  test('a page solved with one wrong entry gets exactly that entry marked', async () => {
    const open = puzzle.letters.flatMap((letter, cell) => (letter !== null && !puzzle.givens.includes(cell) ? [cell] : []));
    const wrongCell = open[3];
    const strokes = open.map(cell => written(layout.grid, cell, cell === wrongCell ? (puzzle.letters[cell] === 'Z' ? 'Y' : 'Z') : (puzzle.letters[cell] as string)));
    const result = await checkCrossword(puzzle, layout.grid, strokes, recognize);
    expect(result.wrong).toEqual([wrongCell]);
    expect(result.right).toHaveLength(open.length - 1);
    expect(result.unread).toEqual([]);
  });

  test('an accent the player writes is folded into the grid letter, and givens are never read', async () => {
    const open = puzzle.letters.flatMap((letter, cell) => (letter !== null && !puzzle.givens.includes(cell) ? [cell] : []));
    const accented: Record<string, string> = { E: 'É', A: 'À', U: 'Ù' };
    const strokes = open.map(cell => written(layout.grid, cell, accented[puzzle.letters[cell] as string] ?? (puzzle.letters[cell] as string)));
    const result = await checkCrossword(puzzle, layout.grid, strokes, recognize);
    expect(result.wrong).toEqual([]);
    expect(result.right.some(cell => puzzle.givens.includes(cell))).toBe(false);
  });
});

describe('pageText', () => {
  test.each([
    ['Épouse du roi', 'Epouse du roi'],
    ['Macht den Kaffee süß', 'Macht den Kaffee suss'],
    ['Niño', 'Niño'],
  ])('%s is drawn as %s', (text, drawn) => {
    expect(pageText(text)).toBe(drawn);
  });
});
