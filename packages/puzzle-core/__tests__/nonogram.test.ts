import { cluesOf, countNonogramSolutions, decodePicture, drawNonogram, encodePicture, generateNonogram, lineClue, NONOGRAM_BANDS, rateNonogram, solveLine } from '../src/nonogram';
import { NONOGRAM_BANK } from '../src/nonogram-bank';
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

  test('a thin picture gives every band for every seed', () => {
    // With the easy limit from the longer side, a picture 5 or 6 cells across rated easy so often
    // that medium failed for up to 26 of 30 seeds on these shapes (#435).
    const failures: string[] = [];
    for (const [thin, longest] of [[5, 19], [6, 16]]) {
      for (let long = 11; long <= longest; long++) {
        for (const size of [{ width: thin, height: long }, { width: long, height: thin }]) {
          for (const band of NONOGRAM_BANDS) {
            for (let seed = 1; seed <= 30; seed++) {
              try {
                generateNonogram(`S${seed}`, size, band);
              } catch {
                failures.push(`${size.width} x ${size.height} ${band} S${seed}`);
              }
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
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

describe('the nonogram bank', () => {
  test('a picture survives its bank text', () => {
    const random = createRandom('bank text');
    for (const count of [25, 26, 29, 250, 625]) {
      const cells = Array.from({ length: count }, () => random.chance(50));
      expect(decodePicture(encodePicture(cells), count)).toEqual(cells);
    }
    expect(() => decodePicture('00', 25)).toThrow('5 digits');
  });

  const pairs = Object.keys(NONOGRAM_BANK);

  test('the bank holds the slow shapes and bands, each entry the right size', () => {
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      const [shape, band] = pair.split(':');
      const [width, height] = shape.split('x').map(Number);
      expect(NONOGRAM_BANDS).toContain(band);
      expect(new Set(NONOGRAM_BANK[pair]).size).toBe(16);
      for (const text of NONOGRAM_BANK[pair]) expect(text).toHaveLength(Math.ceil((width * height) / 5));
    }
  });

  test.each(pairs)('%s keeps one solution and its band over 60 seeds', pair => {
    const [shape, band] = pair.split(':') as [string, (typeof NONOGRAM_BANDS)[number]];
    const [width, height] = shape.split('x').map(Number);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const puzzle = generateNonogram(`S${seed}`, { width, height }, band);
      // The rating finishes the grid by forced steps only, which proves one solution; a search
      // for a second one is left out, as it takes minutes over the whole bank.
      expect(rateNonogram(puzzle)?.difficulty).toBe(band);
      expect(cluesOf(width, height, puzzle.solution).rows).toEqual(puzzle.rows);
      seen.add(encodePicture(puzzle.solution));
    }
    // The seed picks among the entries and their views, so the 60 puzzles are not one picture.
    expect(seen.size).toBeGreaterThan(16);
  });

  test('a shape and band outside the bank is drawn live, as before', () => {
    expect(NONOGRAM_BANK['15x10:medium']).toBeUndefined();
    expect(generateNonogram('P1', { width: 15, height: 10 }, 'medium')).toEqual(drawNonogram('P1', { width: 15, height: 10 }, 'medium'));
  });
});
