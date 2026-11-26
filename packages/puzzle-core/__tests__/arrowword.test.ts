import {
  ARROWWORD_BANDS,
  arrowwordAnswers,
  arrowwordSlots,
  countArrowwordSolutions,
  digest,
  emptyClueCells,
  generateArrowword,
  parsePuzzleCode,
  puzzleCode,
  type ArrowwordSlot,
  type ClueBank,
} from '../src';
import { WORD_LANGUAGES } from '../src/words';
import { maskedClueBank } from '../testing/clue-bank';

/** A 3 x 3 grid: the frame and a 2 x 2 block of letters, crossed by two across and two down answers. */
const CLUES_3 = [true, true, true, true, false, false, true, false, false];
const SLOTS_3 = (clues: [string, string, string, string]): Pick<ArrowwordSlot, 'cells' | 'clue'>[] => [
  { cells: [4, 5], clue: clues[0] },
  { cells: [7, 8], clue: clues[1] },
  { cells: [4, 7], clue: clues[2] },
  { cells: [5, 8], clue: clues[3] },
];
const bank = (entries: [string, string][]): ClueBank => ({ language: 'en', alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', entries: entries.map(([word, clue]) => ({ word, clue })) });

describe('arrowwordSlots', () => {
  test('the 2 x 2 block gives two across and two down answers, each after its clue cell', () => {
    const slots = arrowwordSlots(3, 3, CLUES_3);
    expect(slots).toEqual([
      { clueCell: 3, direction: 'across', cells: [4, 5] },
      { clueCell: 6, direction: 'across', cells: [7, 8] },
      { clueCell: 1, direction: 'down', cells: [4, 7] },
      { clueCell: 2, direction: 'down', cells: [5, 8] },
    ]);
  });

  test.each([
    ['a letter on the frame', [true, false, true, true, false, false, true, false, false]],
    ['a letter in no answer', [true, true, true, true, false, true, true, true, true]],
  ])('%s is refused', (_why, clue) => {
    expect(arrowwordSlots(3, 3, clue)).toBeNull();
  });

  test('an answer longer than the band allows is refused', () => {
    expect(arrowwordSlots(3, 3, CLUES_3, 1)).toBeNull();
  });
});

describe('countArrowwordSolutions', () => {
  // AT / NO across, AN / TO down; «Two letters» fits every two-letter word.
  const words: [string, string][] = [['AT', 'Two letters'], ['NO', 'Two letters'], ['AN', 'Two letters'], ['TO', 'Two letters'], ['ON', 'Two letters']];

  test('shared clues leave more than one fill: the count stops at two', () => {
    expect(countArrowwordSolutions({ slots: SLOTS_3(['Two letters', 'Two letters', 'Two letters', 'Two letters']) as ArrowwordSlot[] }, bank(words))).toBe(2);
  });

  test('clues that name each answer leave one fill', () => {
    const named = bank([['AT', 'Where'], ['NO', 'Refusal'], ['AN', 'Article'], ['TO', 'Towards'], ['ON', 'Article']]);
    expect(countArrowwordSolutions({ slots: SLOTS_3(['Where', 'Refusal', 'Article', 'Towards']) as ArrowwordSlot[] }, named)).toBe(1);
  });

  test('crossings that cannot agree leave none', () => {
    const named = bank([['AT', 'Where'], ['NO', 'Refusal'], ['ON', 'Article'], ['TO', 'Towards']]);
    expect(countArrowwordSolutions({ slots: SLOTS_3(['Where', 'Refusal', 'Article', 'Towards']) as ArrowwordSlot[] }, named)).toBe(0);
  });
});

describe('generateArrowword', () => {
  const banks = Object.fromEntries(WORD_LANGUAGES.map(language => [language, maskedClueBank(language)])) as Record<(typeof WORD_LANGUAGES)[number], ClueBank>;

  test.each(WORD_LANGUAGES.flatMap(language => (['easy', 'medium', 'hard'] as const).map(band => [language, band] as const)))(
    '%s %s: one solution, every answer after its clue cell, from the bank',
    (language, band) => {
      const puzzle = generateArrowword('P1', band, banks[language]);
      const side = ARROWWORD_BANDS[band].side;
      expect([puzzle.columns, puzzle.rows]).toEqual([side, side]);
      expect(countArrowwordSolutions(puzzle, banks[language])).toBe(1);
      const entries = new Set(banks[language].entries.map(e => `${e.word} ${e.clue}`));
      const covered = new Set<number>();
      for (const slot of puzzle.slots) {
        expect(entries.has(`${slot.word} ${slot.clue}`)).toBe(true);
        expect(slot.word.length).toBeLessThanOrEqual(ARROWWORD_BANDS[band].maxWord);
        const step = slot.direction === 'across' ? 1 : side;
        expect(slot.cells[0] - step).toBe(slot.clueCell);
        expect(puzzle.solution[slot.clueCell]).toBe('');
        slot.cells.forEach((cell, i) => {
          expect(puzzle.solution[cell]).toBe(slot.word[i]);
          covered.add(cell);
        });
      }
      expect([...arrowwordAnswers(puzzle).keys()].sort((a, b) => a - b)).toEqual([...covered].sort((a, b) => a - b));
      expect(emptyClueCells(puzzle).length).toBeLessThanOrEqual(side + 1);
      expect(new Set(puzzle.slots.map(slot => slot.word)).size).toBe(puzzle.slots.length);
    },
  );

  test('the same seed gives the same puzzle, another seed another one', () => {
    expect(generateArrowword('S', 'medium', banks.pt)).toEqual(generateArrowword('S', 'medium', banks.pt));
    expect(generateArrowword('S', 'medium', banks.pt).solution).not.toEqual(generateArrowword('T', 'medium', banks.pt).solution);
  });

  // Pinned: they change only when generation changes on purpose, as in determinism.test.ts.
  test('the output for a fixed seed is pinned', () => {
    const puzzle = generateArrowword('P1', 'easy', banks.pt);
    const rows = Array.from({ length: puzzle.rows }, (_, r) => puzzle.solution.slice(r * puzzle.columns, (r + 1) * puzzle.columns).map(l => l || '#').join(''));
    expect(rows).toEqual(['#######', '#LI#ELE', '##RAIOS', '#E#O###', '#LOS#RI', '#AR#SER', '#SAI#IA']);
    expect(WORD_LANGUAGES.map(language => digest(generateArrowword('P1', 'medium', banks[language])))).toEqual(['3892746e', '8fd9d42e', '252ff37a', '7c47bb0f', 'd6cb9de8']);
  });

  test('the code names the language and size, and reads back', () => {
    const puzzle = generateArrowword('P1', 'medium', banks.de);
    expect(puzzleCode(puzzle.id)).toBe('AW-DE8X8-M-P1');
    expect(parsePuzzleCode('aw-de8x8-m-p1')).toEqual(puzzle.id);
  });

  test.each([
    ['expert is no arrowword band', () => generateArrowword('S', 'expert', banks.en), 'an arrowword offers easy, medium, hard'],
    ['a letter outside the alphabet', () => generateArrowword('S', 'easy', bank([['NIÑO', 'Child']])), "not in the grid's alphabet"],
    ['a one-letter answer', () => generateArrowword('S', 'easy', bank([['A', 'First']])), 'shorter than 2 letters'],
    ['an empty clue', () => generateArrowword('S', 'easy', bank([['AT', ' ']])), 'empty clue'],
    ['a bank too small to fill a grid', () => generateArrowword('S', 'easy', bank([['AT', 'Where'], ['TO', 'Towards']])), /no easy arrowword from seed «S»/],
  ])('%s is refused', (_why, make, message) => {
    expect(make).toThrow(message);
  });
});
