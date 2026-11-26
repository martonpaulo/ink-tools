import {
  countKakuroSolutions,
  generateKakuro,
  kakuroRuns,
  KAKURO_SIZES,
  rateKakuro,
  solveKakuro,
  type Kakuro,
  type KakuroClues,
} from '../src/kakuro';
import { kakuroAnswers, kakuroPageSpec } from '../src/kakuro-page';
import { parsePuzzleCode, puzzleCode, type Difficulty } from '../src/code';
import { layoutPage } from '../src/page/layout';

/** The puzzle a fixed seed gives, row by row: `#` a block, a digit the solution. */
const P1_EASY_6 = ['######', '#81#59', '#95817', '##412#', '#89765', '#97#39'];

const grid = (puzzle: Kakuro): string[] =>
  Array.from({ length: puzzle.size }, (_, r) =>
    puzzle.blocks
      .slice(r * puzzle.size, (r + 1) * puzzle.size)
      .map((block, c) => (block ? '#' : String(puzzle.solution[r * puzzle.size + c])))
      .join(''),
  );

/** Every band each size offers, so the tests cover each one. */
const OFFERED: [number, Difficulty][] = Object.entries(KAKURO_SIZES).flatMap(([size, bands]) => bands.map(band => [Number(size), band] as [number, Difficulty]));
const SEEDS = ['P1', 'P2', 'P3'];

describe('generation', () => {
  test('a fixed seed gives the pinned puzzle', () => {
    const puzzle = generateKakuro('P1', 6, 'easy');
    expect(grid(puzzle)).toEqual(P1_EASY_6);
    expect(puzzle.rating).toEqual({ difficulty: 'easy', hardest: 'combinations' });
    expect(puzzle.runs.map(run => `${run.direction} ${run.clue} ${run.sum}`)).toEqual([
      'down 1 17', 'down 2 26', 'down 4 17', 'down 5 16', 'across 6 9', 'across 9 14', 'down 9 16',
      'across 12 30', 'across 19 7', 'down 19 17', 'down 23 14', 'across 24 35', 'across 30 16', 'across 33 12',
    ]);
  });

  test.each(OFFERED)('side %i, %s: one solution, the band asked, valid runs, for each seed', (size, band) => {
    for (const seed of SEEDS) {
      const puzzle = generateKakuro(seed, size, band);
      expect(countKakuroSolutions(puzzle)).toBe(1);
      expect(solveKakuro(puzzle)).toEqual(puzzle.solution);
      expect(puzzle.rating.difficulty).toBe(band);
      expect(rateKakuro(puzzle)?.rating).toEqual(puzzle.rating);
      for (const run of puzzle.runs) {
        const digits = run.cells.map(cell => puzzle.solution[cell]);
        expect(run.cells.length).toBeGreaterThanOrEqual(2);
        expect(run.cells.length).toBeLessThanOrEqual(9);
        expect(new Set(digits).size).toBe(digits.length);
        expect(digits.every(d => d >= 1 && d <= 9)).toBe(true);
        expect(digits.reduce((a, b) => a + b, 0)).toBe(run.sum);
      }
      // Each white cell is in exactly one run across and one down.
      puzzle.blocks.forEach((block, cell) => {
        const through = puzzle.runs.filter(run => run.cells.includes(cell)).map(run => run.direction);
        expect(through.sort()).toEqual(block ? [] : ['across', 'down']);
      });
    }
  });

  test('the same arguments give the same puzzle, and another seed another one', () => {
    expect(generateKakuro('P2', 10, 'medium')).toEqual(generateKakuro('P2', 10, 'medium'));
    expect(grid(generateKakuro('P2', 10, 'medium'))).not.toEqual(grid(generateKakuro('P3', 10, 'medium')));
  });

  test('a size or band not offered is refused', () => {
    expect(() => generateKakuro('P1', 7, 'easy')).toThrow('kakuro size 7 is not offered');
    expect(() => generateKakuro('P1', 10, 'expert')).toThrow('offers easy, medium, hard, not expert');
  });

  test('the puzzle code names it and gives it back', () => {
    const puzzle = generateKakuro('7K2Q9X', 10, 'hard');
    expect(puzzleCode(puzzle.id)).toBe('KK-10-H-7K2Q9X');
    expect(parsePuzzleCode('kk-10-h-7k2q9x')).toEqual(puzzle.id);
  });
});

describe('the solver', () => {
  /** A 3 x 3 grid with one 2 x 2 block of white cells: the sums alone decide how often it solves. */
  const square = (across: [number, number], down: [number, number]): KakuroClues => {
    const blocks = [true, true, true, true, false, false, true, false, false];
    const runs = kakuroRuns(3, blocks).map(run => {
      const sums = run.direction === 'across' ? across : down;
      // The first row's and the first column's run take the first sum.
      return { ...run, sum: sums[run.clue === (run.direction === 'across' ? 3 : 1) ? 0 : 1] };
    });
    return { size: 3, blocks, runs };
  };

  test('counts two solutions where swapping two digits keeps every sum', () => {
    // 1 2 / 2 1 and 2 1 / 1 2 both give 3 across and 3 down.
    const clues = square([3, 3], [3, 3]);
    expect(countKakuroSolutions(clues)).toBe(2);
    expect(rateKakuro(clues)).toBeNull();
  });

  test('finds the one solution of forced sums, rated by the easiest technique', () => {
    // 3 across is 1 2; 4 down is 1 3; so the corner is 1.
    const clues = square([3, 7], [4, 6]);
    expect(countKakuroSolutions(clues)).toBe(1);
    expect(solveKakuro(clues)).toEqual([0, 0, 0, 0, 1, 2, 0, 3, 4]);
    expect(rateKakuro(clues)).toEqual({ rating: { difficulty: 'easy', hardest: 'combinations' }, solution: [0, 0, 0, 0, 1, 2, 0, 3, 4] });
  });

  test('sums no digits can make have no solution', () => {
    const clues = square([3, 3], [17, 17]);
    expect(countKakuroSolutions(clues)).toBe(0);
    expect(solveKakuro(clues)).toBeNull();
    expect(rateKakuro(clues)).toBeNull();
  });
});

describe('the page and its answers', () => {
  test('every offered size fits a page at the 10 mm preset, portrait', () => {
    for (const size of Object.keys(KAKURO_SIZES).map(Number)) {
      const puzzle = generateKakuro('P1', size, KAKURO_SIZES[size][0]);
      expect(() => layoutPage(kakuroPageSpec(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 10 }))).not.toThrow();
    }
  });

  test('the answers are the white cells only, with their digits', () => {
    const puzzle = generateKakuro('P1', 6, 'easy');
    const answers = kakuroAnswers(puzzle);
    expect(answers.size).toBe(puzzle.blocks.filter(block => !block).length);
    expect(answers.get(7)).toBe('8');
    expect(answers.has(0)).toBe(false);
  });
});
