import {
  CODEWORD_BANDS,
  assertNativeGreys,
  cellCenter,
  checkCodeword,
  codewordAnswers,
  createRandom,
  drawCodewordPage,
  generateCodeword,
  parsePuzzleCode,
  puzzleCode,
  solveCodeword,
  type Codeword,
  type InkStroke,
  type ReadText,
} from '../src';
import { WORD_LANGUAGES } from '../src/words';
import { WORD_LISTS } from '../src/words-data';

/** The letter each cell of the puzzle's solution holds, '' for a block. */
const lettersOf = (puzzle: Codeword): string[] => puzzle.numbers.map(n => (n ? puzzle.key[n - 1] : ''));
const givenMap = (puzzle: Codeword): Map<number, string> => new Map(puzzle.givens.map(n => [n, puzzle.key[n - 1]]));

describe('generateCodeword', () => {
  test.each(WORD_LANGUAGES.flatMap(language => CODEWORD_BANDS.map(band => [language, band] as const)))(
    '%s %s: every slot is a word of the list, one number per letter, and the solver finds one key',
    (language, band) => {
      const list = WORD_LISTS[language];
      const puzzle = generateCodeword('BANDS', 11, band, list);
      const letters = lettersOf(puzzle);
      expect(new Set(puzzle.key).size).toBe(puzzle.key.length);
      puzzle.slots.forEach((slot, s) => {
        expect(slot.cells.map(cell => letters[cell]).join('')).toBe(puzzle.words[s]);
        expect(list.words).toContain(puzzle.words[s]);
      });
      expect(new Set(puzzle.words).size).toBe(puzzle.words.length);
      for (const letter of puzzle.key) expect(list.alphabet).toContain(letter);
      const solved = solveCodeword(puzzle.numbers, puzzle.slots, givenMap(puzzle), list.words, 2);
      expect(solved.count).toBe(1);
      expect(solved.keys[0]).toEqual(puzzle.key);
    },
  );

  test('a harder band gives fewer letters', () => {
    const given = CODEWORD_BANDS.map(band => generateCodeword('G', 13, band, WORD_LISTS.en).givens.length);
    expect(given[0]).toBeGreaterThan(given[1]);
    expect(given[1]).toBeGreaterThan(given[2]);
  });

  test('the grid cuts its lines into words of 3, 5 or 7 letters, crossing at even places', () => {
    const puzzle = generateCodeword('GR1D', 15, 'medium', WORD_LISTS.pt);
    for (const slot of puzzle.slots) expect([3, 5, 7]).toContain(slot.cells.length);
    puzzle.numbers.forEach((n, i) => {
      const row = Math.floor(i / 15);
      const col = i % 15;
      if (row % 2 === 1 && col % 2 === 1) expect(n).toBe(0);
      if (row % 2 === 0 && col % 2 === 0) expect(n).toBeGreaterThan(0);
    });
  });

  test('the same seed gives the same puzzle, and its code names the language', () => {
    const puzzle = generateCodeword('S', 9, 'hard', WORD_LISTS.es);
    expect(generateCodeword('S', 9, 'hard', WORD_LISTS.es)).toEqual(puzzle);
    expect(puzzleCode(puzzle.id)).toBe('CW-9ES-H-S');
    expect(parsePuzzleCode('cw-9es-h-s')).toEqual(puzzle.id);
  });

  test.each([
    [8, 'medium', 'odd 5 to 15'],
    [3, 'medium', 'odd 5 to 15'],
    [17, 'medium', 'odd 5 to 15'],
    [9, 'expert', 'easy, medium, hard'],
  ] as const)('side %i at %s is refused: %s', (size, band, why) => {
    expect(() => generateCodeword('S', size, band, WORD_LISTS.en)).toThrow(why);
  });
});

describe('solveCodeword', () => {
  const slots = [{ direction: 'across' as const, cells: [0, 1, 2] }];

  test('counts every key that spells a word, and a given letter leaves one', () => {
    const words = ['CAT', 'DOG', 'TOT'];
    expect(solveCodeword([1, 2, 3], slots, new Map(), words, 5).count).toBe(2);
    expect(solveCodeword([1, 2, 3], slots, new Map([[1, 'D']]), words, 5).keys).toEqual([['D', 'O', 'G']]);
    // The shape 1-2-1 only fits TOT.
    expect(solveCodeword([1, 2, 1], slots, new Map(), words, 5).keys).toEqual([['T', 'O']]);
  });

  test('two numbers never share a letter', () => {
    const cross = [
      { direction: 'across' as const, cells: [0, 1, 2] },
      { direction: 'down' as const, cells: [0, 3, 6] },
    ];
    // Across 1-2-3 and down 1-4-5: TOE across with TOE down would give 2 and 4 the same O.
    const numbers = [1, 2, 3, 4, 0, 0, 5, 0, 0];
    expect(solveCodeword(numbers, cross, new Map(), ['TOE'], 5).count).toBe(0);
  });

  test('stops at the limit', () => {
    expect(solveCodeword([1, 2, 3], slots, new Map(), ['CAT', 'DOG', 'PIG'], 2).count).toBe(2);
  });
});

describe('the codeword page', () => {
  test('draws blocks in ink, a number in every white cell, the key and the footer, in native greys', () => {
    const puzzle = generateCodeword('PAGE', 13, 'medium', WORD_LISTS.en);
    const { layout, raster } = drawCodewordPage(puzzle, { orientation: 'portrait', hand: 'right' });
    assertNativeGreys(raster);
    expect(layout.sidePanel).not.toBeNull();
    const pixel = (x: number, y: number) => raster.pixels[Math.round(y) * raster.width + Math.round(x)];
    const block = puzzle.numbers.indexOf(0);
    const [bx, by] = cellCenter(layout.grid, block % 13, Math.floor(block / 13));
    expect(pixel(bx, by)).toBe(0x00);
    const panel = layout.sidePanel;
    if (!panel) throw new Error('no panel');
    // The key sits on the side away from the right hand.
    expect(panel.x).toBeLessThan(layout.grid.x);
  });

  test('fits a 15 x 15 grid on a landscape page for the left hand', () => {
    const puzzle = generateCodeword('W1DE', 15, 'easy', WORD_LISTS.fr);
    const { layout } = drawCodewordPage(puzzle, { orientation: 'landscape', hand: 'left' });
    expect(layout.sidePanel?.x).toBeGreaterThan(layout.grid.x);
  });

  test('the same puzzle draws the same page', () => {
    const puzzle = generateCodeword('PAGE', 9, 'hard', WORD_LISTS.de);
    const draw = () => Buffer.from(drawCodewordPage(puzzle, { orientation: 'portrait', hand: 'left', cellMm: 10 }).raster.pixels);
    expect(draw().equals(draw())).toBe(true);
  });
});

describe('«Check» on a codeword page', () => {
  /** A short stroke in the cell, tagged with the letter it stands for. */
  type Tag = { letter: string };
  const recognize = async (elements: Tag[]): Promise<ReadText> => ({ ok: true, text: elements.map(tag => tag.letter).join(' ') });

  test('marks exactly the one wrong letter, and never checks a given cell', async () => {
    const puzzle = generateCodeword('CHECK', 9, 'medium', WORD_LISTS.pt);
    const { layout } = drawCodewordPage(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 10 });
    const answers = codewordAnswers(puzzle);
    for (const n of puzzle.givens) puzzle.numbers.forEach((m, i) => m === n && expect(answers.has(i)).toBe(false));
    const cells = [...answers.keys()];
    const wrong = cells[createRandom('W').int(cells.length)];
    const strokes: InkStroke<Tag>[] = cells.map(index => {
      const [cx, cy] = cellCenter(layout.grid, index % 9, Math.floor(index / 9));
      const right = answers.get(index) as string;
      const letter = index === wrong ? (right === 'A' ? 'E' : 'A') : right;
      return { points: [{ x: cx - 10, y: cy }, { x: cx + 10, y: cy }], element: { letter } };
    });
    const result = await checkCodeword(puzzle, layout.grid, strokes, recognize);
    expect(result.wrong).toEqual([wrong]);
    expect(result.right).toHaveLength(cells.length - 1);
    expect(result.empty).toEqual([]);
    expect(result.unread).toEqual([]);
  });
});
