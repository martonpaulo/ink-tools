import { type InkPoint, type InkStroke } from '../src/check';
import { parsePuzzleCode, puzzleCode } from '../src/code';
import {
  checkHitori,
  hitoriFromCode,
  newHitori,
  countHitoriSolutions,
  drawHitoriPage,
  generateHitori,
  HITORI_BANDS,
  HITORI_MAX_SIDE,
  HITORI_MIN_SIDE,
  hitoriLayout,
  isHitoriSolution,
  rateHitori,
  type Hitori,
} from '../src/hitori';
import { cellCenter, type Grid } from '../src/page/grid';
import { createRandom, digest } from '../src/random';

const neighbours = (size: number, i: number): number[] =>
  [i - size, i + size, i % size > 0 ? i - 1 : -1, i % size < size - 1 ? i + 1 : -1].filter(n => n >= 0 && n < size * size);

/**
 * Every shading of a small grid with no two shaded neighbours, kept when it keeps the rules: the
 * count no deduction can skew. (A shading with shaded neighbours breaks a rule, so skipping them
 * changes no count and keeps the test fast.)
 */
function bruteCount(size: number, numbers: readonly number[]): number {
  let count = 0;
  for (let mask = 0; mask < 1 << (size * size); mask++) {
    const shaded = Array.from({ length: size * size }, (_, i) => (mask & (1 << i)) !== 0);
    if (shaded.some((s, i) => s && neighbours(size, i).some(n => shaded[n]))) continue;
    if (isHitoriSolution(size, numbers, shaded)) count++;
  }
  return count;
}

/** A 4 x 4 Latin square with a few cells changed, so it has repeats to shade. */
function nearLatin(seed: string): number[] {
  const random = createRandom(seed);
  const numbers = Array.from({ length: 16 }, (_, i) => 1 + ((Math.floor(i / 4) + (i % 4)) % 4));
  for (let k = 0; k < 2 + random.int(4); k++) numbers[random.int(16)] = 1 + random.int(4);
  return numbers;
}

describe('the solver', () => {
  test('counts as many solutions as trying every shading, on seeded 4 x 4 grids', () => {
    const counts: number[] = [];
    for (let s = 0; s < 30; s++) {
      const numbers = nearLatin(`brute/${s}`);
      const brute = bruteCount(4, numbers);
      expect([s, countHitoriSolutions(4, numbers, 100)]).toEqual([s, brute]);
      counts.push(brute);
    }
    // The sample holds grids with none, one and several solutions, so each branch was compared.
    expect([counts.some(c => c === 0), counts.some(c => c === 1), counts.some(c => c > 1)]).toEqual([true, true, true]);
  });

  test('a number with no repeat in its row or column is never shaded', () => {
    // A Latin square has no repeat at all: the one answer shades nothing.
    const latin = [1, 2, 3, 2, 3, 1, 3, 1, 2];
    expect(countHitoriSolutions(3, latin)).toBe(1);
    expect(isHitoriSolution(3, latin, [true, false, false, false, false, false, false, false, false])).toBe(false);
  });

  test('two shaded neighbours and cut-off white cells break the rules', () => {
    // 1 1 2 / 1 2 3 / 2 3 1: shading the corner 1 is the one answer.
    const numbers = [1, 1, 2, 1, 2, 3, 2, 3, 1];
    const only = (...cells: number[]) => Array.from({ length: 9 }, (_, i) => cells.includes(i));
    expect(isHitoriSolution(3, numbers, only(0))).toBe(true);
    expect(isHitoriSolution(3, numbers, only(0, 1))).toBe(false); // shaded neighbours
    expect(isHitoriSolution(3, numbers, only(1, 3))).toBe(false); // the corner is cut off
    expect(isHitoriSolution(3, numbers, only())).toBe(false); // the 1s repeat
    expect(countHitoriSolutions(3, numbers)).toBe(1);
  });

  test('a grid that needs a guess gets no rating', () => {
    const twin = [3, 3, 1, 2, 1, 3, 2, 2, 2];
    expect(countHitoriSolutions(3, twin)).toBe(2);
    expect(rateHitori(3, twin)).toBeNull();
  });
});

describe('generation', () => {
  /** Pinned per seed: they change only when generation changes on purpose. */
  const PINNED: readonly [number, (typeof HITORI_BANDS)[number], string][] = [
    [5, 'easy', '22c1c168'],
    [8, 'medium', 'ce19aabd'],
    [12, 'hard', '5ac967ec'],
  ];

  test.each(PINNED)('side %i, %s, from seed P1 is pinned and has one solution', (size, band, expected) => {
    const puzzle = generateHitori('P1', size, band);
    expect(digest(puzzle)).toBe(expected);
    expect(countHitoriSolutions(size, puzzle.numbers)).toBe(1);
  });

  test.each(HITORI_BANDS.map(band => [band]))('every side gives a %s puzzle with one solution, kept by its rating', band => {
    for (let size = HITORI_MIN_SIDE; size <= HITORI_MAX_SIDE; size++) {
      const puzzle = generateHitori(`B${size}`, size, band);
      expect(puzzle.numbers.every(n => n >= 1 && n <= size)).toBe(true);
      expect(isHitoriSolution(size, puzzle.numbers, puzzle.solution)).toBe(true);
      expect(countHitoriSolutions(size, puzzle.numbers)).toBe(1);
      expect(rateHitori(size, puzzle.numbers)).toEqual(expect.objectContaining({ difficulty: band, solution: puzzle.solution }));
    }
  });

  test('the same seed gives the same puzzle, another seed another one', () => {
    expect(generateHitori('S1', 8, 'medium')).toEqual(generateHitori('S1', 8, 'medium'));
    expect(generateHitori('S2', 8, 'medium').numbers).not.toEqual(generateHitori('S1', 8, 'medium').numbers);
  });

  test('its code names it and gives it back', () => {
    const puzzle = generateHitori('7K2Q9X', 9, 'hard');
    expect(puzzleCode(puzzle.id)).toBe('HI-9-H-7K2Q9X');
    const id = parsePuzzleCode('hi-9-h-7k2q9x');
    expect(generateHitori(id.seed, Number(id.size), id.difficulty)).toEqual(puzzle);
  });

  test('a side outside 5 to 12 or a band not offered is refused', () => {
    expect(() => generateHitori('S1', 4, 'easy')).toThrow('5 to 12');
    expect(() => generateHitori('S1', 13, 'easy')).toThrow('5 to 12');
    expect(() => generateHitori('S1', 8, 'expert')).toThrow('offers easy, medium, hard');
  });
});

describe('the page', () => {
  test('prints every number and no answer, at the largest cell that fits', () => {
    const puzzle = generateHitori('P1', 8, 'medium');
    const { layout, raster } = drawHitoriPage(puzzle, { orientation: 'portrait', hand: 'right' });
    expect(layout.grid).toEqual(expect.objectContaining({ columns: 8, rows: 8, cell: 177 }));
    expect([raster.width, raster.height]).toEqual([1920, 2560]);
    // A shaded answer cell is as light as a white one: only the printed number is ink.
    const meanOf = (index: number): number => {
      const { grid } = layout;
      const x0 = grid.x + (index % 8) * grid.cell;
      const y0 = grid.y + Math.floor(index / 8) * grid.cell;
      let sum = 0;
      for (let y = y0 + 10; y < y0 + grid.cell - 10; y++) for (let x = x0 + 10; x < x0 + grid.cell - 10; x++) sum += raster.pixels[y * raster.width + x];
      return sum / (grid.cell - 20) ** 2;
    };
    const shaded = puzzle.solution.indexOf(true);
    const white = puzzle.solution.findIndex((s, i) => !s && puzzle.numbers[i] === puzzle.numbers[shaded]);
    expect(Math.abs(meanOf(shaded) - meanOf(white))).toBeLessThan(1);
  });

  test('a 12 x 12 fits a landscape page too', () => {
    const puzzle = generateHitori('P1', 12, 'easy');
    expect(hitoriLayout(puzzle, { orientation: 'landscape', hand: 'left' }).grid.cell).toBe(118);
  });
});

describe('«Check» from the ink', () => {
  const at = (grid: Grid, index: number, u: number, v: number): InkPoint => ({
    x: grid.x + ((index % grid.columns) + u) * grid.cell,
    y: grid.y + (Math.floor(index / grid.columns) + v) * grid.cell,
  });
  const line = (from: InkPoint, to: InkPoint, steps = 20): InkPoint[] =>
    Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }));
  /** A cell hatched over, as a player shades it. */
  const shade = (grid: Grid, index: number): InkStroke => ({
    points: Array.from({ length: 7 }, (_, i) => line(at(grid, index, 0.1, 0.1 + i * 0.13), at(grid, index, 0.9, 0.15 + i * 0.13))).flat(),
    element: null,
  });
  /** A circle round a cell's number, as a player marks a white cell. */
  const circle = (grid: Grid, index: number): InkStroke => {
    const [cx, cy] = cellCenter(grid, index % grid.columns, Math.floor(index / grid.columns));
    const r = grid.cell * 0.4;
    return { points: Array.from({ length: 41 }, (_, i) => ({ x: cx + r * Math.cos((i / 40) * 2 * Math.PI), y: cy + r * Math.sin((i / 40) * 2 * Math.PI) })), element: null };
  };
  const solve = (puzzle: Hitori, grid: Grid, skip: ReadonlySet<number> = new Set()): InkStroke[] =>
    puzzle.solution.flatMap((shaded, i) => (skip.has(i) ? [] : [shaded ? shade(grid, i) : circle(grid, i)]));

  test('a solved page has no wrong cell', () => {
    const puzzle = generateHitori('P1', 8, 'medium');
    const { grid } = hitoriLayout(puzzle, { orientation: 'portrait', hand: 'right' });
    const result = checkHitori(puzzle, grid, solve(puzzle, grid));
    expect(result.wrong).toEqual([]);
    expect(result.right).toHaveLength(64);
  });

  test('one wrong shade and one wrong circle are exactly the cells marked; a blank cell is neither', () => {
    const puzzle = generateHitori('P1', 8, 'medium');
    const { grid } = hitoriLayout(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 10 });
    const whiteCell = puzzle.solution.indexOf(false);
    const shadedCell = puzzle.solution.indexOf(true);
    const blank = puzzle.solution.lastIndexOf(false);
    const strokes = [...solve(puzzle, grid, new Set([whiteCell, shadedCell, blank])), shade(grid, whiteCell), circle(grid, shadedCell)];
    const result = checkHitori(puzzle, grid, strokes);
    expect(result.wrong.sort((a, b) => a - b)).toEqual([whiteCell, shadedCell].sort((a, b) => a - b));
    expect(result.empty).toEqual([blank]);
    expect(result.right).toHaveLength(61);
  });

  test('a grid of another size is refused', () => {
    const puzzle = generateHitori('P1', 8, 'medium');
    const { grid } = hitoriLayout(generateHitori('P1', 9, 'medium'), { orientation: 'portrait', hand: 'right' });
    expect(() => checkHitori(puzzle, grid, [])).toThrow('9 x 9');
  });
});

describe('hitoriFromCode (#394)', () => {
  test('a code names the same hitori again, made live or from the bank, and another game\'s code is refused', () => {
    const live = generateHitori('P1', 8, 'medium');
    expect(hitoriFromCode(puzzleCode(live.id))).toEqual(live);
    const banked = newHitori('P1', 12, 'hard');
    expect(puzzleCode(banked.id)).toMatch(/^HI-12-H-B/);
    expect(hitoriFromCode(puzzleCode(banked.id))).toEqual(banked);
    expect(() => hitoriFromCode('BI-8-E-7K2Q9X')).toThrow('not a hitori code');
  });
});
