import {
  cellIndex,
  checkStarBattle,
  countStarBattleSolutions,
  drawStarBattlePage,
  generateStarBattle,
  layoutStarBattle,
  parsePuzzleCode,
  puzzleCode,
  rateStarBattle,
  starBattleBands,
  starBattleFromCode,
  STAR_BATTLE_MAX_SIDE,
  STAR_BATTLE_MIN_SIDE,
  type InkPoint,
  type InkStroke,
  type StarBattle,
  type StarBattleSize,
} from '../src';
import { cellCenter, type Grid } from '../src/page/grid';

const SIZES: StarBattleSize[] = [
  ...Array.from({ length: STAR_BATTLE_MAX_SIDE - STAR_BATTLE_MIN_SIDE + 1 }, (_, i) => ({ side: STAR_BATTLE_MIN_SIDE + i, stars: 1 as const })),
  { side: 8, stars: 2 },
  { side: 9, stars: 2 },
  { side: 10, stars: 2 },
];
const CASES = SIZES.flatMap(size => starBattleBands(size).map(band => [`${size.side} x ${size.side}, ${size.stars} star`, band, size] as const));

/** The puzzle's rule, checked from scratch: the star counts, no touching stars, joined regions. */
function valid(puzzle: StarBattle): boolean {
  const { side, stars, regions, solution } = puzzle;
  const count = (keep: (i: number) => boolean) => solution.filter((s, i) => s && keep(i)).length;
  for (let u = 0; u < side; u++) {
    if (count(i => Math.floor(i / side) === u) !== stars) return false;
    if (count(i => i % side === u) !== stars) return false;
    if (count(i => regions[i] === u) !== stars) return false;
  }
  for (let i = 0; i < solution.length; i++) {
    if (!solution[i]) continue;
    for (let j = i + 1; j < solution.length; j++) {
      const near = Math.abs(Math.floor(i / side) - Math.floor(j / side)) <= 1 && Math.abs((i % side) - (j % side)) <= 1;
      if (solution[j] && near) return false;
    }
  }
  for (let u = 0; u < side; u++) {
    const cells = regions.map((r, i) => (r === u ? i : -1)).filter(i => i >= 0);
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const cell = stack.pop() as number;
      for (const n of [cell - side, cell + side, cell % side ? cell - 1 : -1, (cell + 1) % side ? cell + 1 : -1]) {
        if (n >= 0 && n < regions.length && regions[n] === u && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

describe('generateStarBattle', () => {
  test.each(CASES)('%s, %s: one solution, the seeded one, in its band', (_name, band, size) => {
    const puzzle = generateStarBattle('BANDS', size, band);
    expect(valid(puzzle)).toBe(true);
    expect(countStarBattleSolutions(size, puzzle.regions, 3)).toBe(1);
    expect(rateStarBattle(size, puzzle.regions)?.difficulty).toBe(band);
    expect(parsePuzzleCode(puzzleCode(puzzle.id))).toEqual(puzzle.id);
  });

  test('the same seed gives the same puzzle, and another seed another', () => {
    const size: StarBattleSize = { side: 8, stars: 1 };
    expect(generateStarBattle('S1', size, 'medium')).toEqual(generateStarBattle('S1', size, 'medium'));
    expect(generateStarBattle('S2', size, 'medium').regions).not.toEqual(generateStarBattle('S1', size, 'medium').regions);
  });

  test('a size or band not offered throws', () => {
    expect(() => generateStarBattle('S1', { side: 4, stars: 1 }, 'easy')).toThrow(RangeError);
    expect(() => generateStarBattle('S1', { side: 11, stars: 1 }, 'easy')).toThrow(RangeError);
    expect(() => generateStarBattle('S1', { side: 7, stars: 2 }, 'hard')).toThrow(RangeError);
    expect(() => generateStarBattle('S1', { side: 8, stars: 1 }, 'expert')).toThrow(RangeError);
    expect(() => generateStarBattle('S1', { side: 10, stars: 2 }, 'easy')).toThrow(/offers hard/);
  });

  test('regions with two solutions count two and get no rating', () => {
    // Regions that are the rows themselves let each row's star sit anywhere the columns allow.
    const stripes = Array.from({ length: 25 }, (_, i) => Math.floor(i / 5));
    expect(countStarBattleSolutions({ side: 5, stars: 1 }, stripes, 2)).toBe(2);
    expect(rateStarBattle({ side: 5, stars: 1 }, stripes)).toBeNull();
  });
});

/** Strokes in page pixels, as `inkctl ink strokes` writes them: a star, a dot. */
const stroke = (points: InkPoint[]): InkStroke<null> => ({ points, element: null });
const STAR_SHARE = 0.35;
const STAR_POINTS = 5;
/** A five-pointed star in one stroke, as a pen draws it: each point joined to the one two ahead. */
function star(grid: Grid, index: number): InkStroke<null> {
  const [cx, cy] = cellCenter(grid, index % grid.columns, Math.floor(index / grid.columns));
  const radius = STAR_SHARE * grid.cell;
  const points = Array.from({ length: STAR_POINTS + 1 }, (_, i) => {
    const angle = -Math.PI / 2 + (((2 * i) % STAR_POINTS) * 2 * Math.PI) / STAR_POINTS;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
  return stroke(points);
}
function dot(grid: Grid, index: number): InkStroke<null> {
  const [cx, cy] = cellCenter(grid, index % grid.columns, Math.floor(index / grid.columns));
  return stroke([{ x: cx - 2, y: cy - 2 }, { x: cx + 2, y: cy + 2 }]);
}

describe('checkStarBattle', () => {
  const puzzle = generateStarBattle('CHECK', { side: 8, stars: 1 }, 'medium');
  const layout = layoutStarBattle(puzzle, { orientation: 'portrait', hand: 'right' });
  const grid = layout.grid;
  const stars = puzzle.solution.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
  const blanks = puzzle.solution.map((s, i) => (s ? -1 : i)).filter(i => i >= 0);

  test('a solved page has every star right and nothing wrong', () => {
    const ink = [...stars.map(i => star(grid, i)), ...blanks.slice(0, 20).map(i => dot(grid, i))];
    expect(checkStarBattle(puzzle, grid, ink)).toEqual({ wrong: [], right: stars, empty: [], unread: [] });
  });

  test('one star in a wrong cell is the one wrong cell, and the cell it left is empty', () => {
    const [moved, ...kept] = stars;
    const wrongCell = blanks.find(i => i !== moved) as number;
    const ink = [...kept.map(i => star(grid, i)), star(grid, wrongCell)];
    expect(checkStarBattle(puzzle, grid, ink)).toEqual({ wrong: [wrongCell], right: kept, empty: [moved], unread: [] });
  });

  test('a dot on a star cell is the one wrong cell', () => {
    const [ruledOut, ...kept] = stars;
    const ink = [...kept.map(i => star(grid, i)), dot(grid, ruledOut)];
    expect(checkStarBattle(puzzle, grid, ink).wrong).toEqual([ruledOut]);
  });

  test('a grid of another size is refused', () => {
    expect(() => checkStarBattle(puzzle, { ...grid, columns: 9 }, [])).toThrow(/own grid/);
  });

  test('the page draws the grid at the largest cell that fits, with no star on it', () => {
    expect(layout.grid.cell).toBeGreaterThan(0);
    const raster = drawStarBattlePage(puzzle, layout, { game: 'Star Battle', difficulty: 'Medium', code: puzzleCode(puzzle.id), rule: 'One star in each row, column and region; stars never touch.' });
    expect([raster.width, raster.height]).toEqual([layout.width, layout.height]);
    // The middle of a cell stays paper: the page never holds the answer.
    const [cx, cy] = cellCenter(grid, stars[0] % 8, Math.floor(stars[0] / 8)).map(Math.round);
    expect(raster.pixels[cy * raster.width + cx]).toBe(0xff);
    expect(cellIndex(grid, 0, 1)).toBe(8);
  });
});

describe('starBattleFromCode (#392)', () => {
  test('a code names the same star battle again, two stars too, and another game\'s code is refused', () => {
    const one = generateStarBattle('P1', { side: 6, stars: 1 }, 'medium');
    expect(starBattleFromCode(puzzleCode(one.id))).toEqual(one);
    const two = generateStarBattle('P1', { side: 8, stars: 2 }, 'easy');
    expect(starBattleFromCode(puzzleCode(two.id))).toEqual(two);
    expect(() => starBattleFromCode('NO-10X10-M-7K2Q9X')).toThrow('not a star battle code');
  });
});
