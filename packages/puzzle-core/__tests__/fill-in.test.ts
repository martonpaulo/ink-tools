import glyphData from './fixtures/inkctl-glyphs.json';
import {
  NATIVE_GREYS,
  assertNativeGreys,
  cellCenter,
  checkFillIn,
  drawFillInPage,
  fillInExpected,
  generateFillIn,
  layoutFillInPage,
  parsePuzzleCode,
  puzzleCode,
  solveFillIn,
  type FillIn,
  type Grid,
  type InkStroke,
  type ReadText,
} from '../src';
import { WORD_LANGUAGES } from '../src/words';
import { WORD_LISTS } from '../src/words-data';
import { expectOnlyWrong } from '../testing/check';

const BANDS = ['easy', 'medium', 'hard'] as const;
const SEEDS = ['A', 'B', 'C'];
const TEXT = { game: 'Fill-in', difficulty: 'Medium', rule: 'Write each word of the list in the grid, across or down.', heading: (n: number) => `${n} letters` };

const givensOf = (puzzle: FillIn) => new Map(puzzle.givens.map(cell => [cell, puzzle.solution[cell]]));

/** Every run of two or more word cells, across and down, as the word it spells. */
function runs(puzzle: FillIn): string[] {
  const { width, height, solution } = puzzle;
  const found: string[] = [];
  const scan = (count: number, length: number, at: (line: number, i: number) => number) => {
    for (let line = 0; line < count; line++) {
      let run = '';
      for (let i = 0; i <= length; i++) {
        const letter = i < length ? solution[at(line, i)] : '';
        if (letter !== '') run += letter;
        else {
          if ([...run].length >= 2) found.push(run);
          run = '';
        }
      }
    }
  };
  scan(height, width, (row, column) => row * width + column);
  scan(width, height, (column, row) => row * width + column);
  return found.sort();
}

describe('generateFillIn', () => {
  describe.each(WORD_LANGUAGES)('%s', language => {
    test.each(BANDS.flatMap(band => SEEDS.map(seed => [band, seed] as const)))('%s, seed %s: one solution, and every run is a listed word', (band, seed) => {
      const list = WORD_LISTS[language];
      const puzzle = generateFillIn(seed, band, list);
      expect(solveFillIn(puzzle.slots, puzzle.words, givensOf(puzzle), 2).count).toBe(1);
      expect(runs(puzzle)).toEqual([...puzzle.words].sort());
      for (const slot of puzzle.slots) expect(slot.cells.map(cell => puzzle.solution[cell]).join('')).toBe(slot.word);
      for (const word of puzzle.words) expect(list.words).toContain(word);
      expect(new Set(puzzle.words).size).toBe(puzzle.words.length);
      expect(puzzle.id).toEqual({ game: 'fill-in', size: language.toUpperCase(), difficulty: band, seed });
      expect(parsePuzzleCode(puzzleCode(puzzle.id))).toEqual(puzzle.id);
    });
  });

  test('the same seed gives the same puzzle, and the pinned seed gives the pinned words', () => {
    const puzzle = generateFillIn('P1', 'medium', WORD_LISTS.pt);
    expect(generateFillIn('P1', 'medium', WORD_LISTS.pt)).toEqual(puzzle);
    expect(puzzle.words).toEqual(['FIM', 'FIO', 'MES', 'DADO', 'FILA', 'RATO', 'ENTAO', 'ESTAR', 'TOSSE', 'FEITOS', 'ODEIAM', 'POSSAM', 'TINHAM', 'PESADELO', 'SAUDAVEL']);
    expect([puzzle.width, puzzle.height]).toEqual([11, 11]);
    expect(puzzle.rating).toEqual({ givens: 4, revealed: 1 });
  });

  test('easy and medium print a starter word; hard prints only what uniqueness needs', () => {
    for (const band of ['easy', 'medium'] as const) {
      const puzzle = generateFillIn('S', band, WORD_LISTS.en);
      const printed = new Set(puzzle.givens);
      expect(puzzle.slots.some(slot => slot.cells.every(cell => printed.has(cell)))).toBe(true);
    }
    const hard = generateFillIn('S', 'hard', WORD_LISTS.en);
    expect(hard.rating.givens).toBe(hard.rating.revealed);
  });

  test('expert is refused', () => {
    expect(() => generateFillIn('S', 'expert', WORD_LISTS.en)).toThrow('a fill-in offers easy, medium, hard, not expert');
  });
});

describe('solveFillIn', () => {
  // Two crossing words of three letters: ABC across row 0, and a down word through its B.
  const slots = [{ cells: [0, 1, 2] }, { cells: [1, 4, 7] }];

  test('counts each way the words fill the slots, and a printed letter cuts the others off', () => {
    // ABC across puts B where a down word starts, so BXY goes down; the other way round, ABC cannot.
    expect(solveFillIn(slots, ['ABC', 'BXY'], new Map(), 5).count).toBe(1);
    expect(solveFillIn(slots, ['BXY', 'ABC'], new Map(), 5).solutions[0].slice(0, 3)).toEqual(['A', 'B', 'C']);
    // ABA and BAB fit both ways round, until a printed letter fixes one.
    expect(solveFillIn(slots, ['ABA', 'BAB'], new Map(), 5).count).toBe(2);
    expect(solveFillIn(slots, ['ABA', 'BAB'], new Map([[0, 'A']]), 5).count).toBe(1);
  });

  test('stops at the limit, and a list of the wrong length has no solution', () => {
    expect(solveFillIn(slots, ['ABA', 'BAB'], new Map(), 1).count).toBe(1);
    expect(solveFillIn(slots, ['ABA'], new Map(), 5).count).toBe(0);
  });
});

describe('the fill-in page', () => {
  test.each([
    ['portrait', 'right'],
    ['portrait', 'left'],
    ['landscape', 'right'],
    ['landscape', 'left'],
  ] as const)('every band fits a %s page for a %s hand, the list away from the hand', (orientation, hand) => {
    for (const band of BANDS) {
      const puzzle = generateFillIn('P1', band, WORD_LISTS.de);
      const layout = layoutFillInPage(puzzle, { orientation, hand }, TEXT.heading);
      const { grid } = layout.page;
      expect([grid.columns, grid.rows]).toEqual([puzzle.width, puzzle.height]);
      const listLeft = Math.min(...layout.columns.map(column => column.x));
      if (hand === 'right') expect(listLeft).toBeLessThan(grid.x);
      else expect(listLeft).toBeGreaterThan(grid.x + grid.columns * grid.cell);
      expect(layout.columns.flatMap(column => column.lines).filter(line => !line.heading && line.text !== '').map(line => line.text)).toEqual(puzzle.words);
    }
  });

  test('draws in native greys, with paper outside the word cells', () => {
    const puzzle = generateFillIn('P1', 'medium', WORD_LISTS.pt);
    const raster = drawFillInPage(puzzle, { orientation: 'portrait', hand: 'right' }, TEXT, puzzleCode(puzzle.id));
    assertNativeGreys(raster);
    const { grid } = layoutFillInPage(puzzle, { orientation: 'portrait', hand: 'right' }, TEXT.heading).page;
    const empty = puzzle.solution.findIndex(letter => letter === '');
    const [x, y] = cellCenter(grid, empty % puzzle.width, Math.floor(empty / puzzle.width));
    expect(raster.pixels[Math.round(y) * raster.width + Math.round(x)]).toBe(NATIVE_GREYS[15]);
  });
});

describe('«Check» on a fill-in page', () => {
  const GLYPHS = glyphData.glyphs as unknown as Record<string, number[][][]>;
  const GLYPH_HEIGHT = 90;
  const WRITTEN_SHARE = 0.7;

  /** A letter written in a cell as `inkctl ink write` draws it, its strokes tagged with the letter. */
  type Tag = { ch: string };
  function write(grid: Grid, cell: number, letter: string): InkStroke<Tag>[] {
    const ch = letter.toLowerCase();
    const scale = (WRITTEN_SHARE * grid.cell) / GLYPH_HEIGHT;
    const [cx, cy] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    const xs = GLYPHS[ch].flat().map(p => p[0]);
    const left = cx - ((Math.max(...xs) - Math.min(...xs)) * scale) / 2 - Math.min(...xs) * scale;
    const top = cy - (GLYPH_HEIGHT * scale) / 2;
    const tag = { ch };
    return GLYPHS[ch].map(stroke => ({ points: stroke.map(([px, py]) => ({ x: left + px * scale, y: top + py * scale })), element: tag }));
  }

  /** A recogniser that reads each written letter back once, in order, spaced. */
  const recognize = async (elements: Tag[]): Promise<ReadText> => {
    const seen: Tag[] = [];
    for (const tag of elements) if (!seen.includes(tag)) seen.push(tag);
    return { ok: true, text: seen.map(tag => tag.ch).join(' ') };
  };

  test('a page solved with one wrong letter gets exactly that cell marked', async () => {
    const puzzle = generateFillIn('P1', 'easy', WORD_LISTS.en);
    const { grid } = layoutFillInPage(puzzle, { orientation: 'portrait', hand: 'right' }, TEXT.heading).page;
    const expected = fillInExpected(puzzle);
    const wrong = [...expected.keys()][3];
    const written = (cell: number) => {
      const letter = expected.get(cell) as string;
      return cell === wrong ? (letter === 'Q' ? 'X' : 'Q') : letter;
    };
    const strokes = [...expected.keys()].flatMap(cell => write(grid, cell, written(cell)));
    const result = await checkFillIn(puzzle, grid, strokes, recognize);
    expectOnlyWrong(result, wrong, expected.size);
  });

  test('printed letters are never checked, and a grid of another size is refused', async () => {
    const puzzle = generateFillIn('P1', 'easy', WORD_LISTS.en);
    for (const cell of puzzle.givens) expect(fillInExpected(puzzle).has(cell)).toBe(false);
    const grid = layoutFillInPage(puzzle, { orientation: 'portrait', hand: 'right' }, TEXT.heading).page.grid;
    await expect(checkFillIn(puzzle, { ...grid, columns: grid.columns + 1 }, [], recognize)).rejects.toThrow('not the fill-in');
  });
});
