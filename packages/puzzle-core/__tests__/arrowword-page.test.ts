import {
  arrowwordAnswers,
  assertNativeGreys,
  checkArrowword,
  createPage,
  drawArrowword,
  emptyClueCells,
  fitClue,
  generateArrowword,
  layoutPage,
  TONES,
  wrapClue,
  type InkStroke,
  type ReadText,
} from '../src';
import { cellCenter } from '../src/page/grid';
import { maskedClueBank } from '../testing/clue-bank';

const puzzle = generateArrowword('P1', 'hard', maskedClueBank('pt'));
const layout = layoutPage({ orientation: 'portrait', hand: 'right', cellMm: 15, lattice: 'square', columns: puzzle.columns, rows: puzzle.rows });
const grid = layout.grid;
const centre = (index: number) => cellCenter(grid, index % grid.columns, Math.floor(index / grid.columns));

describe('drawArrowword', () => {
  const page = createPage(layout);
  drawArrowword(page, grid, puzzle);
  const pixel = (x: number, y: number) => page.pixels[Math.round(y) * page.width + Math.round(x)];

  test('uses native greys only', () => {
    expect(() => assertNativeGreys(page)).not.toThrow();
  });

  test('letter cells stay paper and draw no answer; empty clue cells are shaded', () => {
    const answers = arrowwordAnswers(puzzle);
    for (const index of answers.keys()) {
      const [x, y] = centre(index);
      for (const [dx, dy] of [[0, 0], [-20, -20], [20, 20], [-20, 20], [20, -20]]) expect(pixel(x + dx, y + dy)).toBe(TONES.paper);
    }
    for (const index of emptyClueCells(puzzle)) expect(pixel(...centre(index))).toBe(TONES.shade);
  });

  test('each clue cell draws ink: its text and arrow', () => {
    for (const slot of puzzle.slots) {
      const [column, row] = [slot.clueCell % grid.columns, Math.floor(slot.clueCell / grid.columns)];
      let ink = 0;
      for (let y = grid.y + row * grid.cell + 4; y < grid.y + (row + 1) * grid.cell - 4; y++) {
        for (let x = grid.x + column * grid.cell + 4; x < grid.x + (column + 1) * grid.cell - 4; x++) if (pixel(x, y) === TONES.ink) ink++;
      }
      expect(ink).toBeGreaterThan(0);
    }
  });

  test('a grid of another size is refused', () => {
    expect(() => drawArrowword(createPage(layout), { ...grid, columns: grid.columns - 1 }, puzzle)).toThrow('square grid');
  });
});

describe('wrapClue', () => {
  test('fills each line up to the width', () => {
    expect(wrapClue('a b c', 10_000, 35)).toEqual(['a b c']);
    expect(wrapClue('aaaa bbbb', 100, 35)).toEqual(['aaaa', 'bbbb']);
  });

  test('a word wider than the cell is refused', () => {
    expect(() => wrapClue('Unbreakableword', 60, 35)).toThrow('wider than its clue cell');
  });

  test('a clue with letters the page font lacks is drawn with them folded, as in the crossword', () => {
    expect(fitClue('Félin für Öl', grid.cell, grid.cell / 2)).toEqual(['Felin fur', 'Ol']);
    const accented = { ...puzzle, slots: puzzle.slots.map((slot, i) => (i === 0 ? { ...slot, clue: 'Ação ß' } : slot)) };
    expect(() => drawArrowword(createPage(layout), grid, accented)).not.toThrow();
  });

  test('a clue too long for its share of the cell is refused when drawn', () => {
    const long = { ...puzzle, slots: puzzle.slots.map((slot, i) => (i === 0 ? { ...slot, clue: 'one two three four five six seven eight nine ten' } : slot)) };
    expect(() => drawArrowword(createPage(layout), grid, long)).toThrow('more than its clue cell holds');
  });
});

describe('checkArrowword', () => {
  /** One stroke per written letter at its cell's centre; the recogniser reads back the letters it is given. */
  const write = (letters: ReadonlyMap<number, string>): InkStroke<string>[] =>
    [...letters].map(([index, letter]) => {
      const [x, y] = centre(index);
      return { points: [{ x: x - 10, y: y - 10 }, { x: x + 10, y: y + 10 }], element: letter };
    });
  const recognize = async (elements: string[]): Promise<ReadText> => ({ ok: true, text: elements.join('') });
  const answers = arrowwordAnswers(puzzle);

  test('a solved page with one wrong entry gets exactly that entry marked', async () => {
    const [wrongCell, right] = [...answers][3];
    const written = new Map(answers);
    written.set(wrongCell, right === 'A' ? 'E' : 'A');
    const result = await checkArrowword(puzzle, grid, write(written), recognize);
    expect(result.wrong).toEqual([wrongCell]);
    expect(result.right).toHaveLength(answers.size - 1);
    expect(result.unread).toEqual([]);
  });

  test('an unfilled cell is empty and a letter the recogniser misses is unread, never wrong', async () => {
    const [skipped, missed] = [...answers.keys()];
    const written = new Map(answers);
    written.delete(skipped);
    written.set(missed, '?');
    const result = await checkArrowword(puzzle, grid, write(written), recognize);
    expect(result.empty).toEqual([skipped]);
    expect(result.wrong).toEqual([]);
    expect(result.unread.map(u => u.index)).toEqual([missed]);
  });
});
