import { cluesOf, countNonogramSolutions, generateNonogram, lineClue, NONOGRAM_BANDS, rateNonogram, solveLine } from '../src/nonogram';
import { createRandom, digest } from '../src/random';

const U = -1;
const E = 0;
const F = 1;

// A 10 x 10 this generator made (seed FIXTURE, hard), pinned with its rating.
const HARD = {
  width: 10,
  height: 10,
  rows: [[4], [4], [3], [2], [1], [2], [2], [4, 2], [1, 3], [2, 3]],
  columns: [[2, 2], [1, 1, 1], [4, 1], [4, 1], [3, 1], [2], [3], [4], [2], [1]],
};

describe('line solving', () => {
  test('a clue reads the runs of a line', () => {
    expect(lineClue([true, true, false, true, false, false, true])).toEqual([2, 1, 1]);
    expect(lineClue([false, false])).toEqual([]);
  });

  test('overlap fixes the middle of a long block', () => {
    expect(solveLine([7], new Array(10).fill(U))).toEqual([U, U, U, F, F, F, F, U, U, U]);
  });

  test('a full clue fixes the whole line, an empty one empties it', () => {
    expect(solveLine([2, 1], [U, U, U, U])).toEqual([F, F, E, F]);
    expect(solveLine([], [U, U, U])).toEqual([E, E, E]);
  });

  test('known cells push the deduction further', () => {
    expect(solveLine([3], [U, U, F, U, U, E, U, U])).toEqual([U, U, F, U, U, E, E, E]);
  });

  test('a line that cannot hold its clue is a contradiction', () => {
    expect(solveLine([3], [U, E, U, E])).toBeNull();
    expect(solveLine([1], [F, U, F])).toBeNull();
  });
});

describe('uniqueness and rating', () => {
  test('the known hard nonogram has one solution and needs probing', () => {
    expect(countNonogramSolutions(HARD)).toBe(1);
    expect(rateNonogram(HARD)).toEqual(expect.objectContaining({ difficulty: 'hard' }));
  });

  test('a diagonal pair has two solutions and no rating', () => {
    const twin = cluesOf(2, 2, [true, false, false, true]);
    expect(countNonogramSolutions(twin)).toBe(2);
    expect(rateNonogram(twin)).toBeNull();
  });

  test('a filled square is easy', () => {
    expect(rateNonogram(cluesOf(5, 5, new Array(25).fill(true)))).toEqual({ difficulty: 'easy', sweeps: 1, probes: 0 });
  });

  test('probing gives the same ratings as before its trials were pruned', () => {
    // 400 seeded pictures of 8 to 15 per side: 250 easy, 41 medium, 5 hard and 104 that need a
    // guess, so probing runs on 109 of them. The digest was taken before #434 pruned the probe
    // trials that a consistent trial already covers; the pruning must change no rating.
    const ratings = Array.from({ length: 400 }, (_, i) => {
      const random = createRandom(`ratings/${i}`);
      const side = 8 + random.int(8);
      const cells = Array.from({ length: side * side }, () => random.chance(58));
      return rateNonogram(cluesOf(side, side, cells));
    });
    expect(digest(ratings)).toBe('6a06d440');
  });
});

describe('generateNonogram', () => {
  const cases = [5, 10, 15, 20, 25].flatMap(side => NONOGRAM_BANDS.map(band => [side, band] as const));

  test.each(cases)('a %i-cell square offers %s with one solution', (side, band) => {
    const puzzle = generateNonogram('BANDS', { width: side, height: side }, band);
    expect(rateNonogram(puzzle)?.difficulty).toBe(band);
    expect(countNonogramSolutions(puzzle)).toBe(1);
    expect(cluesOf(side, side, puzzle.solution).rows).toEqual(puzzle.rows);
    expect(puzzle.solution.some(Boolean) && !puzzle.solution.every(Boolean)).toBe(true);
  });

  test('a seed that once ran out of attempts finds its puzzle', () => {
    // At the old fill chance, under 1 % of 15 x 10 pictures rated medium, and this seed found none
    // in all its attempts (#380).
    expect(rateNonogram(generateNonogram('S1', { width: 15, height: 10 }, 'medium'))?.difficulty).toBe('medium');
  });

  test('a small hard picture that once ran out of attempts finds its puzzle', () => {
    // Small pictures rarely need probing: 5 x 5 hard found none for S2 in 360 attempts (#380).
    expect(rateNonogram(generateNonogram('S2', { width: 5, height: 5 }, 'hard'))?.difficulty).toBe('hard');
  });

  test('a wide picture keeps its width and height apart', () => {
    const puzzle = generateNonogram('W', { width: 15, height: 10 }, 'medium');
    expect([puzzle.rows.length, puzzle.columns.length, puzzle.id.size]).toEqual([10, 15, '15X10']);
  });

  test('the same seed gives the same picture', () => {
    expect(generateNonogram('S', { width: 10, height: 10 }, 'easy')).toEqual(generateNonogram('S', { width: 10, height: 10 }, 'easy'));
  });

  test('a side or band out of range is refused', () => {
    expect(() => generateNonogram('S', { width: 4, height: 10 }, 'easy')).toThrow('5 to 25');
    expect(() => generateNonogram('S', { width: 10, height: 10 }, 'expert')).toThrow('not expert');
  });
});
