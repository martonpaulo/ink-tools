import {
  cellAt,
  cellIndex,
  checkCells,
  classifyMark,
  inkedEdges,
  innerCellAt,
  normalizeRead,
  pathCells,
  readCells,
  strokeSpan,
  strokesByCell,
  type InkPoint,
  type InkStroke,
  type ReadText,
} from '../src/check';
import { generateKakuro } from '../src/kakuro';
import { checkKakuro, kakuroPageSpec } from '../src/kakuro-page';
import { cellCenter, type Grid } from '../src/page/grid';
import { layoutPage } from '../src/page/layout';
import { fakeRecognizer, write, type Tag } from '../testing/ink';

const line = (from: InkPoint, to: InkPoint, steps = 20): InkPoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }));
const stroke = (points: InkPoint[]): InkStroke<null> => ({ points, element: null });

const sudokuGrid = (): Grid =>
  layoutPage({ orientation: 'portrait', hand: 'right', cellMm: 10, lattice: 'square', columns: 9, rows: 9 }).grid;

/** A solved 9 x 9 sudoku, row by row. */
const SOLUTION = [
  '534678912', '672195348', '198342567', '859761423', '426853791', '713924856', '961537284', '287419635', '345286179',
].join('');

describe('the ink check on a sudoku page in inkctl ink', () => {
  test('marks the wrong digits and leaves the right ones unmarked, one call per row', async () => {
    const grid = sudokuGrid();
    // Every third cell is a printed given, never written and never checked.
    const filled = [...SOLUTION].map((_, i) => i).filter(i => i % 3 !== 0);
    const wrongCells = new Set([cellIndex(grid, 4, 2), cellIndex(grid, 8, 7)]);
    const strokes = filled.flatMap(i => {
      const ch = wrongCells.has(i) ? String(((Number(SOLUTION[i]) % 9) + 1)) : SOLUTION[i];
      return write(grid, i % 9, Math.floor(i / 9), ch);
    });
    const { recognize, calls } = fakeRecognizer();
    const reads = await readCells(grid, strokes, filled, recognize, 'digit');
    const result = checkCells(new Map(filled.map(i => [i, SOLUTION[i]])), reads, 'digit');
    expect(result.wrong.sort((a, b) => a - b)).toEqual([...wrongCells].sort((a, b) => a - b));
    expect(result.right).toHaveLength(filled.length - wrongCells.size);
    expect(result.unread).toEqual([]);
    expect(calls).toHaveLength(9);
  });

  test('a row answer that does not count the inked cells falls back to cell calls', async () => {
    const grid = sudokuGrid();
    const strokes = [...write(grid, 0, 0, '1'), ...write(grid, 1, 0, '2'), ...write(grid, 2, 0, '3')];
    const calls: number[] = [];
    const recognize = async (elements: Tag[]): Promise<ReadText> => {
      calls.push(elements.length);
      const chars = [...new Set(elements.map(tag => tag.ch))];
      // The row call joins two digits into one stray reading; single cells read right.
      return { ok: true, text: chars.length > 1 ? '1 2 3 .' : chars[0] };
    };
    const reads = await readCells(grid, strokes, [0, 1, 2], recognize, 'digit');
    expect(reads).toEqual([
      { index: 0, status: 'read', text: '1' },
      { index: 1, status: 'read', text: '2' },
      { index: 2, status: 'read', text: '3' },
    ]);
    expect(calls).toHaveLength(4);
  });

  test('a cell that reads no text is unread, never wrong', async () => {
    const grid = sudokuGrid();
    const strokes = [...write(grid, 0, 0, '1'), ...write(grid, 1, 0, '8')];
    // The two-stroke 8 gave no text in device round 11 (#378).
    const { recognize } = fakeRecognizer(ch => (ch === '8' ? null : ch));
    const reads = await readCells(grid, strokes, [0, 1], recognize, 'digit');
    const result = checkCells(new Map([[0, '1'], [1, '8']]), reads, 'digit');
    expect(result.right).toEqual([0]);
    expect(result.wrong).toEqual([]);
    expect(result.unread).toEqual([{ index: 1, reason: 'no text' }]);
  });

  test('a failed or throwing recogniser leaves its cells unread with the message', async () => {
    const grid = sudokuGrid();
    const strokes = [...write(grid, 0, 0, '4'), ...write(grid, 1, 0, '5')];
    const failing = async (): Promise<ReadText> => ({ ok: false, message: 'recognizeElements failed' });
    const throwing = async (): Promise<ReadText> => {
      throw new Error('host gone');
    };
    expect(await readCells(grid, strokes, [0, 1], failing, 'digit')).toEqual([
      { index: 0, status: 'unread', reason: 'recognizeElements failed' },
      { index: 1, status: 'unread', reason: 'recognizeElements failed' },
    ]);
    expect((await readCells(grid, strokes, [0], throwing, 'digit'))[0]).toEqual({ index: 0, status: 'unread', reason: 'host gone' });
  });

  test('an empty page reads every cell empty with no call', async () => {
    const grid = sudokuGrid();
    const { recognize, calls } = fakeRecognizer();
    const reads = await readCells(grid, [], [0, 1, 2], recognize, 'digit');
    expect(checkCells(new Map([[0, '1'], [1, '2'], [2, '3']]), reads, 'digit').empty).toEqual([0, 1, 2]);
    expect(calls).toEqual([]);
  });

  test('multi-digit tokens map one per cell, and a joined answer is read cell by cell', async () => {
    const grid = layoutPage({ orientation: 'portrait', hand: 'right', cellMm: 7, lattice: 'square', columns: 16, rows: 16 }).grid;
    const strokes = [...write(grid, 0, 0, '1', -grid.cell / 8), ...write(grid, 0, 0, '2', grid.cell / 8), ...write(grid, 1, 0, '7')];
    const tokens = async (): Promise<ReadText> => ({ ok: true, text: '12 7' });
    expect(await readCells(grid, strokes, [0, 1], tokens, 'number')).toEqual([
      { index: 0, status: 'read', text: '12' },
      { index: 1, status: 'read', text: '7' },
    ]);
    const joined = fakeRecognizer();
    await readCells(grid, strokes, [0, 1], async elements => {
      const answer = await joined.recognize(elements);
      return answer.ok && answer.text ? { ok: true, text: answer.text.replace(/ /g, '') } : answer;
    }, 'number');
    expect(joined.calls).toHaveLength(3);
  });

  test('a lower-case, spaced or stray answer is read by position, and a stray character is unread', async () => {
    const grid = sudokuGrid();
    const strokes = [...write(grid, 0, 0, '1'), ...write(grid, 1, 0, '2'), ...write(grid, 2, 0, '9')];
    const spaced = async (): Promise<ReadText> => ({ ok: true, text: 'l2 g' });
    expect((await readCells(grid, strokes, [0, 1, 2], spaced, 'digit')).map(read => read.status === 'read' && read.text)).toEqual(['1', '2', '9']);
    const stray = async (): Promise<ReadText> => ({ ok: true, text: '1 / 9' });
    expect((await readCells(grid, strokes, [0, 1, 2], stray, 'digit'))[1]).toEqual({ index: 1, status: 'unread', reason: 'read «/», not a digit' });
  });
});

describe('the kakuro «Check» in inkctl ink', () => {
  test('a page solved with one wrong entry gets exactly that entry marked', async () => {
    const puzzle = generateKakuro('P1', 10, 'medium');
    const grid = layoutPage(kakuroPageSpec(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 10 })).grid;
    const whites = puzzle.blocks.flatMap((block, i) => (block ? [] : [i]));
    const wrong = whites[Math.floor(whites.length / 2)];
    const strokes = whites.flatMap(i => {
      const digit = i === wrong ? (puzzle.solution[i] % 9) + 1 : puzzle.solution[i];
      return write(grid, i % puzzle.size, Math.floor(i / puzzle.size), String(digit));
    });
    const { recognize, calls } = fakeRecognizer();
    const result = await checkKakuro(grid, puzzle, strokes, recognize);
    expect(result.wrong).toEqual([wrong]);
    expect(result.right).toHaveLength(whites.length - 1);
    expect(result.empty).toEqual([]);
    expect(result.unread).toEqual([]);
    // One call per row that holds white cells: the clue row has none.
    expect(calls).toHaveLength(puzzle.size - 1);
  });

  test('a half-solved page leaves the unwritten cells empty, never wrong', async () => {
    const puzzle = generateKakuro('P1', 6, 'easy');
    const grid = layoutPage(kakuroPageSpec(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 15 })).grid;
    const whites = puzzle.blocks.flatMap((block, i) => (block ? [] : [i]));
    const written = whites.slice(0, 3);
    const strokes = written.flatMap(i => write(grid, i % puzzle.size, Math.floor(i / puzzle.size), String(puzzle.solution[i])));
    const result = await checkKakuro(grid, puzzle, strokes, fakeRecognizer().recognize);
    expect(result.right).toEqual(written);
    expect(result.wrong).toEqual([]);
    expect(result.empty).toEqual(whites.slice(3));
  });
});

describe('normalizeRead', () => {
  test.each([
    ['o', 'digit', '0'],
    ['l', 'digit', '1'],
    [' 7 ', 'digit', '7'],
    ['12', 'digit', null],
    ['1 2', 'number', '12'],
    ['0', 'letter', 'O'],
    ['a', 'letter', 'A'],
    ['ç', 'letter', 'Ç'],
    ['✗', 'letter', null],
  ] as const)('reads «%s» as a %s: %s', (text, alphabet, expected) => {
    expect(normalizeRead(text, alphabet)).toBe(expected);
  });

  test('checkCells refuses an expected value outside the alphabet', () => {
    expect(() => checkCells(new Map([[0, 'x']]), [], 'digit')).toThrow('not a digit');
  });
});

describe('cellAt and strokesByCell', () => {
  test.each(['square', 'hex', 'triangle'] as const)('every %s cell centre is found in its own cell', lattice => {
    const grid = layoutPage({ orientation: 'portrait', hand: 'right', cellMm: 10, lattice, columns: 7, rows: 6 }).grid;
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        const [x, y] = cellCenter(grid, column, row);
        expect(cellAt(grid, x, y)).toBe(cellIndex(grid, column, row));
      }
    }
    expect(cellAt(grid, grid.x - 5, grid.y - 5)).toBeNull();
  });

  test('a digit written across a border goes to the cell that holds most of it; ink off the grid goes nowhere', () => {
    const grid = sudokuGrid();
    const across = write(grid, 0, 0, '7', grid.cell * 0.3);
    const footer = stroke(line({ x: grid.x, y: grid.y + 10 * grid.cell }, { x: grid.x + grid.cell, y: grid.y + 10 * grid.cell }));
    const byCell = strokesByCell<Tag | null>(grid, [...across, footer]);
    expect([...byCell.keys()]).toEqual([0]);
  });
});

describe('classifyMark', () => {
  const grid = sudokuGrid();
  const at = (u: number, v: number): InkPoint => ({ x: grid.x + u * grid.cell, y: grid.y + v * grid.cell });

  test('tells a dot, a cross and a shade from every written digit', () => {
    expect(classifyMark(grid, 0, [])).toBe('empty');
    expect(classifyMark(grid, 0, [stroke(line(at(0.45, 0.45), at(0.55, 0.55)))])).toBe('dot');
    expect(classifyMark(grid, 0, [stroke(line(at(0.2, 0.2), at(0.8, 0.8))), stroke(line(at(0.8, 0.2), at(0.2, 0.8)))])).toBe('cross');
    const hatch = Array.from({ length: 7 }, (_, i) => line(at(0.1, 0.1 + i * 0.13), at(0.9, 0.15 + i * 0.13))).flat();
    expect(classifyMark(grid, 0, [stroke(hatch)])).toBe('shade');
    for (const digit of '0123456789') {
      expect([digit, classifyMark(grid, 0, write(grid, 0, 0, digit))]).toEqual([digit, 'other']);
    }
  });
});

describe('the player lines', () => {
  const grid = sudokuGrid();
  const at = (u: number, v: number): InkPoint => ({ x: grid.x + u * grid.cell, y: grid.y + v * grid.cell });

  test('inkedEdges finds a drawn loop around one cell and no edge from a corner or a digit', () => {
    const loop = stroke([...line(at(1, 1), at(2, 1)), ...line(at(2, 1), at(2, 2)), ...line(at(2, 2), at(1, 2)), ...line(at(1, 2), at(1, 1))]);
    expect([...inkedEdges(grid, [loop])].sort()).toEqual(['h:1,1', 'h:1,2', 'v:1,1', 'v:2,1']);
    const corner = stroke(line(at(2.9, 3), at(3.1, 3)));
    expect(inkedEdges(grid, [corner, ...write(grid, 4, 4, '1')]).size).toBe(0);
    expect(() => inkedEdges({ ...grid, lattice: 'hex' }, [loop])).toThrow('square grid');
  });

  test('pathCells follows a maze path with no jitter along a border', () => {
    const wobble = Array.from({ length: 41 }, (_, i) => at(0.5 + (i / 40) * 2, i % 2 ? 0.48 : 0.52));
    const down = line(at(2.5, 0.5), at(2.5, 2.5));
    const path = pathCells([...wobble, ...down], (x, y) => innerCellAt(grid, x, y));
    expect(path).toEqual([0, 1, 2, 11, 20]);
    const border = line(at(0.5, 1.02), at(2.5, 0.98));
    expect(pathCells(border, (x, y) => innerCellAt(grid, x, y))).toEqual([]);
  });

  test('strokeSpan finds a straight strike and refuses a bowed one', () => {
    expect(strokeSpan(grid, stroke(line(at(0.5, 0.5), at(4.5, 4.5))))).toEqual({ from: 0, to: 40, straight: true });
    const bowed = stroke([...line(at(0.5, 0.5), at(2.5, 1.5)), ...line(at(2.5, 1.5), at(4.5, 0.5))]);
    expect(strokeSpan(grid, bowed)).toEqual({ from: 0, to: 4, straight: false });
    expect(strokeSpan(grid, stroke(line(at(-1, 0.5), at(2.5, 0.5))))).toBeNull();
  });
});
