import { countSudokuSolutions, decodeSudoku, digSudoku, encodeSudoku, generateSudoku, solveSudoku, sudokuFromCode, SUDOKU_SIZES } from '../src/sudoku';
import { puzzleCode } from '../src/code';
import { SUDOKU_BANK } from '../src/sudoku-bank';
import { finishSudoku, geometry, isSingleAt, nextSudokuStep, rateSudoku, solvesWithin, type SudokuShape } from '../src/sudoku-techniques';
import { createRandom } from '../src/random';

const NINE: SudokuShape = { size: 9, boxRows: 3, boxCols: 3 };
const grid = (text: string): number[] => [...text].map(ch => (ch === '.' ? 0 : Number(ch)));

// Puzzles this generator made (seed FIXTURE), pinned with their band and hardest technique.
const KNOWN = [
  { text: '...1...8.6..5.....35..84..9..1..7.4.7.......8.9.4..6.......5........1.2.4.....93.', band: 'easy', hardest: 'hidden single' },
  { text: '...17..8.6..5.....35..84.....1..7.4.7......98.9.4..6.......5........1.2.4.....93.', band: 'medium', hardest: 'locked candidates' },
  { text: '9.385....75.......4.......2...26.1......9..28....1..76......3.13....9...671...5..', band: 'hard', hardest: 'naked pair' },
  { text: '..5.283..6.31......1.............5....2.45....4.97....47.3...8....4.17.6.2......5', band: 'expert', hardest: 'xy-wing' },
] as const;

/** True when every row, column and box holds each value once. */
function valid(shape: SudokuShape, values: readonly number[]): boolean {
  return geometry(shape).units.every(unit => new Set(unit.map(cell => values[cell])).size === shape.size && unit.every(cell => values[cell] > 0));
}

describe('solution count', () => {
  test.each(KNOWN)('the $band puzzle has one solution', ({ text }) => {
    expect(countSudokuSolutions(NINE, grid(text))).toBe(1);
  });

  test('an empty grid has many, counted only to the limit', () => {
    expect(countSudokuSolutions(NINE, new Array(81).fill(0))).toBe(2);
  });

  test('a contradiction has none', () => {
    const values = new Array(81).fill(0);
    values[0] = 5;
    values[1] = 5;
    expect(countSudokuSolutions(NINE, values)).toBe(0);
  });

  test('blanking a swappable rectangle of a solution leaves two', () => {
    const solution = solveSudoku(NINE, grid(KNOWN[0].text)) as number[];
    // Find rows r1, r2 in one band and columns c1, c2 where the values a b / b a can swap.
    let found: number[] | null = null;
    for (let r1 = 0; r1 < 9 && !found; r1++) {
      for (let r2 = r1 + 1; r2 < 9 && Math.floor(r2 / 3) === Math.floor(r1 / 3) && !found; r2++) {
        for (let c1 = 0; c1 < 9 && !found; c1++) {
          for (let c2 = c1 + 1; c2 < 9 && !found; c2++) {
            if (Math.floor(c1 / 3) === Math.floor(c2 / 3)) continue;
            const [a, b, c, d] = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
            if (solution[a] === solution[d] && solution[b] === solution[c]) found = [a, b, c, d];
          }
        }
      }
    }
    expect(found).not.toBeNull();
    const holed = solution.slice();
    for (const cell of found as number[]) holed[cell] = 0;
    expect(countSudokuSolutions(NINE, holed)).toBe(2);
  });
});

describe('rating', () => {
  test.each(KNOWN)('the known puzzle rates $band by $hardest', ({ text, band, hardest }) => {
    const rating = rateSudoku(NINE, grid(text));
    expect(rating.difficulty).toBe(band);
    expect(rating.hardest).toBe(hardest);
  });

  test('a ceiling below the need rates null', () => {
    expect(rateSudoku(NINE, grid(KNOWN[2].text), 'medium').difficulty).toBeNull();
  });

  test('the next step of a hint is a correct placement', () => {
    const values = grid(KNOWN[0].text);
    const solution = solveSudoku(NINE, values) as number[];
    const step = nextSudokuStep(NINE, values);
    expect(step?.technique).toMatch(/single/);
    for (const { cell, value } of step?.placements ?? []) expect(solution[cell]).toBe(value);
    expect(nextSudokuStep(NINE, solution)).toBeNull();
  });

  test('every candidate an expert step removes is wrong', () => {
    const values = grid(KNOWN[3].text);
    const solution = solveSudoku(NINE, values) as number[];
    // Play the easier steps, then check the first expert one against the solution.
    let step = nextSudokuStep(NINE, values);
    while (step && step.technique !== 'xy-wing') {
      for (const p of step.placements) values[p.cell] = p.value;
      if (!step.placements.length) break;
      step = nextSudokuStep(NINE, values);
    }
    for (const e of step?.eliminations ?? []) expect(solution[e.cell]).not.toBe(e.value);
  });
});

describe('generateSudoku', () => {
  const offered = Object.values(SUDOKU_SIZES).flatMap(shape => shape.bands.map(band => [shape.size, band] as const));

  test.each(offered)('size %i offers %s with one solution in that band', (size, band) => {
    const puzzle = generateSudoku('BANDS', size, band);
    expect(puzzle.rating.difficulty).toBe(band);
    expect(countSudokuSolutions(puzzle.shape, puzzle.givens)).toBe(1);
    expect(valid(puzzle.shape, puzzle.solution)).toBe(true);
    puzzle.givens.forEach((v, cell) => v && expect(v).toBe(puzzle.solution[cell]));
    expect(puzzle.id).toEqual({ game: 'sudoku', size: String(size), difficulty: band, seed: 'BANDS' });
  });

  test('the same seed gives the same puzzle, another seed another', () => {
    expect(generateSudoku('S', 9, 'medium')).toEqual(generateSudoku('S', 9, 'medium'));
    expect(generateSudoku('S', 9, 'medium').givens).not.toEqual(generateSudoku('T', 9, 'medium').givens);
    expect(generateSudoku('', 4, 'easy')).toEqual(generateSudoku('', 4, 'easy'));
  });

  test('many seeds keep the band, one solution and the givens of their solution', () => {
    for (const [size, band] of offered) {
      for (let i = 0; i < 6; i++) {
        const puzzle = generateSudoku(`MANY${i}`, size, band);
        expect([size, band, puzzle.rating.difficulty]).toEqual([size, band, band]);
        expect(valid(puzzle.shape, puzzle.solution)).toBe(true);
        puzzle.givens.forEach((v, cell) => v && expect(v).toBe(puzzle.solution[cell]));
        if (size <= 9) expect(countSudokuSolutions(puzzle.shape, puzzle.givens)).toBe(1);
      }
    }
  });

  test('a size or band not offered is refused', () => {
    expect(() => generateSudoku('S', 5, 'easy')).toThrow('not offered');
    expect(() => generateSudoku('S', 4, 'hard')).toThrow('offers easy, not hard');
  });
});

describe('the sudoku bank', () => {
  const offered = Object.values(SUDOKU_SIZES).flatMap(({ bands, ...shape }) => bands.map(band => [shape.size, band, shape] as const));

  test.each(offered)('every size %i %s entry is distinct, finished by its band and rated that band', (_size, band, shape) => {
    const entries = SUDOKU_BANK[`${shape.size}:${band}`];
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries).size).toBe(entries.length);
    for (const text of entries) {
      const givens = decodeSudoku(text);
      expect(givens).toHaveLength(shape.size * shape.size);
      expect(encodeSudoku(givens)).toBe(text);
      expect(solvesWithin(shape, givens, band)).toBe(true);
      expect(rateSudoku(shape, givens).difficulty).toBe(band);
    }
  });

  test('the bank is what the digger makes from its seeds', () => {
    // scripts/sudoku-bank.cjs writes entry 0 from the seed bank/<size>/<band>/0.
    expect(encodeSudoku(digSudoku('bank/9/hard/0', 9, 'hard').givens)).toBe(SUDOKU_BANK['9:hard'][0]);
    expect(encodeSudoku(digSudoku('bank/16/medium/0', 16, 'medium').givens)).toBe(SUDOKU_BANK['16:medium'][0]);
  });
});

describe('the fast checks agree with the full rating', () => {
  /** Grids part of the way through digging: a solution with a seeded share of cells emptied. */
  function holed(shape: SudokuShape, seed: string, share: number): number[] {
    const solution = solveSudoku(shape, new Array(shape.size * shape.size).fill(0)) as number[];
    const random = createRandom(seed);
    return solution.map(v => (random.chance(share) ? 0 : v));
  }

  test('finishSudoku finishes exactly what rateSudoku rates, with the one solution', () => {
    for (const size of [4, 6, 9, 12]) {
      const { boxRows, boxCols } = SUDOKU_SIZES[size];
      const shape = { size, boxRows, boxCols };
      for (let i = 0; i < 25; i++) {
        const values = holed(shape, `H${i}`, 45 + i);
        for (const ceiling of ['easy', 'medium', 'hard', 'expert'] as const) {
          const finished = finishSudoku(shape, values, ceiling);
          expect(finished !== null).toBe(rateSudoku(shape, values, ceiling).difficulty !== null);
          if (finished) expect(finished).toEqual(solveSudoku(shape, values));
        }
      }
    }
  });

  test('isSingleAt holds only where a naked or hidden single places the value', () => {
    const values = grid(KNOWN[0].text);
    const solution = solveSudoku(NINE, values) as number[];
    const step = nextSudokuStep(NINE, values);
    const placed = step?.placements[0];
    expect(placed).toBeDefined();
    if (!placed) return;
    expect(isSingleAt(NINE, values, placed.cell, placed.value)).toBe(true);
    // A cell of the full solution emptied alone is always a naked single.
    const full = solution.slice();
    full[40] = 0;
    expect(isSingleAt(NINE, full, 40, solution[40])).toBe(true);
    // The empty grid forces nothing.
    expect(isSingleAt(NINE, new Array(81).fill(0), 0, 1)).toBe(false);
  });
});

describe('the sudoku code (#383)', () => {
  test('names the same puzzle again, at every size, and another game\'s code is refused', () => {
    for (const size of [4, 9, 16]) {
      const puzzle = generateSudoku('7K2Q9X', size, 'easy');
      expect(sudokuFromCode(puzzleCode(puzzle.id))).toEqual(puzzle);
    }
    expect(() => sudokuFromCode('JS-9-E-7K2Q9X')).toThrow('not a sudoku code');
  });
});
