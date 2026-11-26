import {
  LIGHT_UP_BANDS,
  checkLightUp,
  countLightUpSolutions,
  digest,
  drawLightUpPage,
  generateLightUp,
  parsePuzzleCode,
  puzzleCode,
  rateLightUp,
  solveLightUp,
  type InkPoint,
  type InkStroke,
  type LightUp,
  type LightUpGrid,
} from '../src';
import { cellCenter, type Grid } from '../src/page/grid';

const open = (width: number, height: number): LightUpGrid & { walls: boolean[]; clues: (number | null)[] } => ({
  width,
  height,
  walls: new Array(width * height).fill(false),
  clues: new Array(width * height).fill(null),
});

/** The bulbs beside a cell, for checking a generated grid's numbers against its solution. */
function beside(p: LightUp, i: number): number {
  const c = i % p.width;
  const r = Math.floor(i / p.width);
  return [c > 0 && p.solution[i - 1], c + 1 < p.width && p.solution[i + 1], r > 0 && p.solution[i - p.width], r + 1 < p.height && p.solution[i + p.width]].filter(Boolean).length;
}

describe('the solver', () => {
  test('a 4 in the middle of a 3 x 3 puts a bulb on each side, by the direct rules', () => {
    const grid = open(3, 3);
    grid.walls[4] = true;
    grid.clues[4] = 4;
    expect(countLightUpSolutions(grid)).toBe(1);
    expect(rateLightUp(grid)).toEqual({ difficulty: 'easy', probes: 0 });
    expect(solveLightUp(grid)).toEqual([false, true, false, true, false, true, false, true, false]);
  });

  test('an open 2 x 2 has two solutions and no rating', () => {
    expect(countLightUpSolutions(open(2, 2))).toBe(2);
    expect(rateLightUp(open(2, 2))).toBeNull();
    expect(solveLightUp(open(2, 2))).toBeNull();
  });

  test('a number no bulbs can meet has no solution', () => {
    const grid = open(3, 1);
    grid.walls[0] = true;
    grid.clues[0] = 2;
    expect(countLightUpSolutions(grid)).toBe(0);
    expect(rateLightUp(grid)).toBeNull();
  });
});

const SAMPLES: readonly [seed: string, width: number, height: number][] = [
  ['P1', 7, 7],
  ['S2', 10, 10],
  ['T3', 12, 8],
];

describe('generation', () => {
  describe.each(LIGHT_UP_BANDS)('%s', difficulty => {
    test.each(SAMPLES)('seed %s, %i x %i: one solution, the band asked, numbers that match the bulbs', (seed, width, height) => {
      const p = generateLightUp(seed, { width, height }, difficulty);
      expect(countLightUpSolutions(p)).toBe(1);
      expect(rateLightUp(p)?.difficulty).toBe(difficulty);
      expect(solveLightUp(p)).toEqual(p.solution);
      p.clues.forEach((n, i) => n !== null && expect([i, n]).toEqual([i, beside(p, i)]));
      p.solution.forEach((bulb, i) => bulb && expect(p.walls[i]).toBe(false));
    });
  });

  test('the same seed gives the same grid, and a different seed another', () => {
    const a = generateLightUp('P1', { width: 10, height: 10 }, 'medium');
    expect(generateLightUp('P1', { width: 10, height: 10 }, 'medium')).toEqual(a);
    expect(generateLightUp('P2', { width: 10, height: 10 }, 'medium').walls).not.toEqual(a.walls);
  });

  test('pinned output for fixed seeds', () => {
    expect(digest(generateLightUp('P1', { width: 7, height: 7 }, 'easy'))).toBe('ce0d3a36');
    expect(digest(generateLightUp('P1', { width: 10, height: 10 }, 'hard'))).toBe('fe009ec1');
  });

  test('its code names the game, size, band and seed', () => {
    const p = generateLightUp('7K2Q', { width: 10, height: 8 }, 'hard');
    expect(puzzleCode(p.id)).toBe('LU-10X8-H-7K2Q');
    expect(parsePuzzleCode('LU-10X8-H-7K2Q')).toEqual(p.id);
  });

  test('a side outside 5 to 12 and the expert band are refused', () => {
    expect(() => generateLightUp('P1', { width: 4, height: 7 }, 'easy')).toThrow(RangeError);
    expect(() => generateLightUp('P1', { width: 7, height: 13 }, 'easy')).toThrow(RangeError);
    expect(() => generateLightUp('P1', { width: 7, height: 7 }, 'expert')).toThrow(RangeError);
  });
});

describe('the page and «Check»', () => {
  const puzzle = generateLightUp('P1', { width: 10, height: 10 }, 'medium');
  const { layout } = drawLightUpPage(puzzle, { orientation: 'portrait', hand: 'right' });
  const grid: Grid = layout.grid;

  const at = (i: number) => cellCenter(grid, i % puzzle.width, Math.floor(i / puzzle.width));
  /** A pen circle of a third of the cell, as a player draws a bulb. */
  const circle = (i: number): InkStroke<number> => {
    const [cx, cy] = at(i);
    const points: InkPoint[] = Array.from({ length: 25 }, (_, k) => ({ x: cx + grid.cell * 0.3 * Math.cos((k * Math.PI) / 12), y: cy + grid.cell * 0.3 * Math.sin((k * Math.PI) / 12) }));
    return { points, element: i };
  };
  const dot = (i: number): InkStroke<number> => {
    const [cx, cy] = at(i);
    return { points: [{ x: cx, y: cy }, { x: cx + 3, y: cy + 2 }], element: i };
  };
  const bulbs = puzzle.solution.flatMap((bulb, i) => (bulb ? [i] : []));
  const empties = puzzle.walls.flatMap((wall, i) => (!wall && !puzzle.solution[i] ? [i] : []));

  test('fits the page at the largest cell that fits, with the footer', () => {
    expect(layout.grid.cell).toBe(118);
  });

  test('a solved page has nothing wrong', () => {
    const result = checkLightUp(puzzle, layout, [...bulbs.map(circle), ...empties.slice(0, 5).map(dot)]);
    expect(result).toEqual({ wrong: [], right: bulbs, missing: [], solved: true });
  });

  test('one bulb moved to a wrong cell marks exactly that cell', () => {
    const [moved, ...rest] = bulbs;
    const wrongCell = empties[0];
    const result = checkLightUp(puzzle, layout, [...rest.map(circle), circle(wrongCell)]);
    expect(result.wrong).toEqual([wrongCell]);
    expect(result.missing).toEqual([moved]);
    expect(result.solved).toBe(false);
  });

  test('a dot where a bulb belongs is wrong, and ink on a wall is ignored', () => {
    const wall = puzzle.walls.indexOf(true);
    const result = checkLightUp(puzzle, layout, [dot(bulbs[0]), circle(wall)]);
    expect(result.wrong).toEqual([bulbs[0]]);
    expect(result.right).toEqual([]);
    expect(result.missing).toEqual(bulbs.slice(1));
  });
});
