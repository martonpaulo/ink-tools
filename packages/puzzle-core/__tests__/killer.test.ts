import {
  DIFFICULTIES,
  KILLER_BANDS,
  NATIVE_GREYS,
  checkKiller,
  countKillerSolutions,
  decodeKiller,
  digKiller,
  digest,
  drawKillerPage,
  encodeKiller,
  encodePng,
  generateKiller,
  killerFromCode,
  parsePuzzleCode,
  puzzleCode,
  solveKiller,
  type KillerSudoku,
} from '../src';
import { KILLER_BANK } from '../src/killer-bank';
import { fakeRecognizer, write } from '../testing/ink';

/** True when the cells form one piece, edge to edge. */
function connected(cells: readonly number[]): boolean {
  const inside = new Set(cells);
  const reached = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    const cell = queue.pop() as number;
    const r = Math.floor(cell / 9);
    const c = cell % 9;
    const next = [r > 0 ? cell - 9 : -1, r < 8 ? cell + 9 : -1, c > 0 ? cell - 1 : -1, c < 8 ? cell + 1 : -1];
    for (const n of next) {
      if (inside.has(n) && !reached.has(n)) {
        reached.add(n);
        queue.push(n);
      }
    }
  }
  return reached.size === inside.size;
}

/** Every rule a killer must keep: cages cover the grid once, hold distinct digits and add up. */
function expectWellFormed(puzzle: KillerSudoku): void {
  const band = KILLER_BANDS[puzzle.id.difficulty];
  const cells = puzzle.cages.flatMap(cage => cage.cells).sort((a, b) => a - b);
  expect(cells).toEqual(Array.from({ length: 81 }, (_, i) => i));
  for (const cage of puzzle.cages) {
    const digits = cage.cells.map(cell => puzzle.solution[cell]);
    expect(new Set(digits).size).toBe(digits.length);
    expect(digits.reduce((a, b) => a + b, 0)).toBe(cage.sum);
    expect(cage.cells.length).toBeLessThanOrEqual(band.maxCage);
  }
  for (let i = 0; i < 9; i++) {
    const row = Array.from({ length: 9 }, (_, k) => puzzle.solution[i * 9 + k]);
    const column = Array.from({ length: 9 }, (_, k) => puzzle.solution[k * 9 + i]);
    const box = Array.from({ length: 9 }, (_, k) => puzzle.solution[(3 * Math.floor(i / 3) + Math.floor(k / 3)) * 9 + 3 * (i % 3) + (k % 3)]);
    for (const unit of [row, column, box]) expect(new Set(unit).size).toBe(9);
  }
  for (const cage of puzzle.cages) expect(connected(cage.cells)).toBe(true);
  const givens = puzzle.givens.filter(v => v > 0).length;
  expect(givens).toBeLessThanOrEqual(band.maxGivens);
  expect(puzzle.rating.givens).toBe(givens);
  puzzle.givens.forEach((v, i) => v > 0 && expect(v).toBe(puzzle.solution[i]));
}

/**
 * Pinned digests per band (#387): they change only when generation changes on purpose. A view of
 * a bank entry is a bijection of grids, so it keeps the entry's one solution; the solver re-proves
 * it here but for the expert view, whose proof takes seconds.
 */
const PINNED: readonly [string, () => KillerSudoku, boolean, string][] = [
  ['bank view easy', () => generateKiller('P1', 'easy'), true, '2bb0bb62'],
  ['bank view medium', () => generateKiller('P1', 'medium'), true, '0839fa38'],
  ['bank view hard', () => generateKiller('P1', 'hard'), true, '55a28384'],
  ['bank view expert', () => generateKiller('P1', 'expert'), false, 'fa7fb0a2'],
  ['dug easy', () => digKiller('P1', 'easy'), true, 'e6ca3d15'],
  ['dug medium', () => digKiller('P1', 'medium'), true, '4bfa1387'],
];

describe('killer sudoku generation', () => {
  test.each(PINNED)('%s keeps the rules, its one solution and its pinned output', (_name, make, prove, expected) => {
    const puzzle = make();
    expectWellFormed(puzzle);
    if (prove) {
      expect(countKillerSolutions(puzzle.cages, puzzle.givens)).toBe(1);
      expect(solveKiller(puzzle.cages, puzzle.givens)).toEqual(puzzle.solution);
    }
    expect(digest(puzzle)).toBe(expected);
  });

  test('the same seed gives the same puzzle, another seed another one', () => {
    expect(generateKiller('7K2Q9X', 'hard')).toEqual(generateKiller('7K2Q9X', 'hard'));
    expect(encodeKiller(generateKiller('7K2Q9X', 'hard'))).not.toBe(encodeKiller(generateKiller('7K2Q9Y', 'hard')));
  });

  test('a code names the killer and reads back', () => {
    const puzzle = generateKiller('7K2Q9X', 'medium');
    expect(puzzleCode(puzzle.id)).toBe('KS-9-M-7K2Q9X');
    expect(parsePuzzleCode('KS-9-M-7K2Q9X')).toEqual(puzzle.id);
  });

  test('a band it does not offer is refused', () => {
    expect(() => generateKiller('P1', 'impossible' as never)).toThrow(RangeError);
    expect(() => digKiller('P1', 'impossible' as never)).toThrow(RangeError);
  });

  test('the solver counts no solution, one, and stops at the limit', () => {
    const { cages, givens, solution } = decodeKiller(KILLER_BANK.easy[0]);
    expect(countKillerSolutions(cages, givens)).toBe(1);
    // One cage whose sum is off by one has no solution.
    const broken = cages.map((cage, i) => (i === 0 ? { ...cage, sum: cage.sum + 1 } : cage));
    expect(countKillerSolutions(broken, givens)).toBe(0);
    expect(solveKiller(broken, givens)).toBeNull();
    // Each row as a cage of 45 says nothing a sudoku does not: many solutions, counted to the limit.
    const rows = Array.from({ length: 9 }, (_, r) => ({ cells: Array.from({ length: 9 }, (_, c) => r * 9 + c), sum: 45 }));
    expect(countKillerSolutions(rows, new Array(81).fill(0), 3)).toBe(3);
    expect(solveKiller(rows, solution)).toEqual(solution);
  });

  test('cages that miss a cell or share one are refused', () => {
    const { cages, givens } = decodeKiller(KILLER_BANK.easy[0]);
    expect(() => countKillerSolutions(cages.slice(1), givens)).toThrow('leave a cell out');
    expect(() => countKillerSolutions([...cages, cages[0]], givens)).toThrow('in two cages');
  });
});

describe('the killer bank', () => {
  // The digger proved every entry; this proves them again, the expert ones on a sample for time.
  const PROVED: Readonly<Record<string, number>> = { easy: 24, medium: 24, hard: 24, expert: 4 };

  test.each(DIFFICULTIES)('the %s entries have exactly their own solution', band => {
    const entries = KILLER_BANK[band];
    expect(entries).toHaveLength(24);
    for (const entry of entries.slice(0, PROVED[band])) {
      const { cages, givens, solution } = decodeKiller(entry);
      expect(encodeKiller({ cages, givens, solution })).toBe(entry);
      expect(countKillerSolutions(cages, givens)).toBe(1);
      expect(solveKiller(cages, givens)).toEqual(solution);
    }
  });

  test('the bank is what the digger makes from its seeds', () => {
    // scripts/killer-bank.cjs writes entry 0 from the seed bank/<band>/0.
    expect(encodeKiller(digKiller('bank/easy/0', 'easy'))).toBe(KILLER_BANK.easy[0]);
    expect(encodeKiller(digKiller('bank/medium/0', 'medium'))).toBe(KILLER_BANK.medium[0]);
  });
});

describe('the killer page and its check', () => {
  test('the page fits, in native greys, and never shows an answer', () => {
    const puzzle = generateKiller('P1', 'expert');
    const { layout, raster } = drawKillerPage(puzzle, { orientation: 'portrait', hand: 'right' });
    expect([layout.grid.columns, layout.grid.rows, layout.grid.cell]).toEqual([9, 9, 177]);
    expect(new Set(raster.pixels).size).toBeLessThanOrEqual(NATIVE_GREYS.length);
    expect(() => encodePng(raster)).not.toThrow();
    // A page with every answer written as a given differs from the page drawn: no answer is drawn.
    const solved = drawKillerPage({ ...puzzle, givens: puzzle.solution }, { orientation: 'portrait', hand: 'right' });
    expect(Buffer.from(solved.raster.pixels).equals(Buffer.from(raster.pixels))).toBe(false);
    expect(digest([...encodePng(raster)])).toBe('6d09de27');
  });

  test('«Check» marks exactly the one wrong entry of a page solved in inkctl ink', async () => {
    const puzzle = generateKiller('P1', 'medium');
    const { layout } = drawKillerPage(puzzle, { orientation: 'landscape', hand: 'left', cellMm: 10 });
    const { grid } = layout;
    const open = puzzle.givens.flatMap((v, i) => (v === 0 ? [i] : []));
    const wrongCell = open[17];
    const strokes = open.flatMap(i => {
      const v = puzzle.solution[i];
      return write(grid, i % 9, Math.floor(i / 9), String(i === wrongCell ? (v % 9) + 1 : v));
    });
    const { recognize, calls } = fakeRecognizer();
    const result = await checkKiller(puzzle, grid, strokes, recognize);
    expect(result.wrong).toEqual([wrongCell]);
    expect(result.right).toHaveLength(open.length - 1);
    expect(result.empty).toEqual([]);
    expect(result.unread).toEqual([]);
    expect(calls).toHaveLength(9);
  });

  test('«Check» leaves empty cells empty and refuses another grid', async () => {
    const puzzle = generateKiller('P1', 'easy');
    const { layout } = drawKillerPage(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 15 });
    const { recognize } = fakeRecognizer();
    const result = await checkKiller(puzzle, layout.grid, [], recognize);
    expect(result.wrong).toEqual([]);
    expect(result.empty).toHaveLength(puzzle.givens.filter(v => v === 0).length);
    await expect(checkKiller(puzzle, { ...layout.grid, columns: 8 }, [], recognize)).rejects.toThrow('its own grid');
  });
});

describe('the killer sudoku code (#387)', () => {
  test('names the same puzzle again, and another game\'s code is refused', () => {
    const puzzle = generateKiller('7K2Q9X', 'medium');
    expect(digest(killerFromCode(puzzleCode(puzzle.id)))).toBe(digest(puzzle));
    expect(() => killerFromCode('SU-9-M-7K2Q9X')).toThrow('not a killer sudoku code');
  });
});
