import { checkMaze, drawMazeAnswer, drawMazeCheck, drawMazePage, generateMaze, MAZE_SHAPES, mazeCellCentre, mazeFromCode, mazeLayout, mazeMarks, mazePageSize, mazeSolutionLine, NATIVE_GREYS, parseMazeSizeToken, puzzleCode, type InkStroke, type Maze, type MazeSize } from '../src';

/** FNV-1a over the pixel bytes: `digest` goes through JSON, too slow for a whole page. */
function pixelHash(pixels: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < pixels.length; i++) h = Math.imul(h ^ pixels[i], 0x01000193);
  return (h >>> 0).toString(16);
}

const RECT: MazeSize = { shape: 'rectangle', width: 12, height: 16 };
const CIRCLE: MazeSize = { shape: 'circle', rings: 8 };

function pathStroke(maze: Maze, cells: number[], grid: ReturnType<typeof mazeLayout>['grid']): InkStroke {
  return { points: cells.map(c => ({ x: mazeCellCentre(maze, grid, c)[0], y: mazeCellCentre(maze, grid, c)[1] })), element: null };
}

/** A cell off the solution that touches it through a passage, with the solution cell it hangs from. */
function sideCell(maze: Maze): [number, number] {
  const on = new Set(maze.solution);
  for (let i = 0; i < maze.walls.length; i++) {
    const [a, b] = maze.walls[i];
    if (maze.open[i] && on.has(a) !== on.has(b)) return on.has(a) ? [a, b] : [b, a];
  }
  throw new Error('no side cell');
}

describe.each([['rectangle', RECT], ['circle', CIRCLE]] as const)('a %s maze page', (_name, size) => {
  const maze = generateMaze('7K2Q9X', size, 'medium');
  const layout = mazeLayout(maze, 'portrait', 'right');

  test('is drawn in native greys, the same every time, with no solution on it', () => {
    const a = drawMazePage(maze, layout);
    const b = drawMazePage(maze, layout);
    expect(new Set(a.pixels).size).toBeGreaterThan(1);
    for (const v of new Set(a.pixels)) expect(NATIVE_GREYS).toContain(v);
    expect(pixelHash(a.pixels)).toBe(pixelHash(b.pixels));
    for (const cell of maze.solution.slice(1, -1)) {
      const [x, y] = mazeCellCentre(maze, layout.grid, cell);
      expect(a.pixels[Math.round(y) * a.width + Math.round(x)]).toBe(0xff);
    }
  });

  test('has a solution line through every solution cell', () => {
    expect(mazeSolutionLine(maze, layout)).toHaveLength(maze.solution.length);
  });

  test('a path along the solution is solved with nothing wrong', () => {
    const result = checkMaze(maze, layout, [pathStroke(maze, maze.solution, layout.grid)]);
    expect(result).toMatchObject({ wrong: [], crossings: [], solved: true });
  });

  test('one wrong entry marks exactly that cell', () => {
    const [from, side] = sideCell(maze);
    const at = maze.solution.indexOf(from);
    const detour = [...maze.solution.slice(0, at + 1), side, from, ...maze.solution.slice(at + 1)];
    const result = checkMaze(maze, layout, [pathStroke(maze, detour, layout.grid)]);
    expect(result.wrong).toEqual([side]);
    expect(result.crossings).toEqual([]);
  });

  test('a path that stops short is not solved', () => {
    const result = checkMaze(maze, layout, [pathStroke(maze, maze.solution.slice(0, 3), layout.grid)]);
    expect(result).toMatchObject({ wrong: [], solved: false });
  });
});

test('a path through a wall names the wall', () => {
  const maze = generateMaze('7K2Q9X', RECT, 'medium');
  const layout = mazeLayout(maze, 'portrait', 'right');
  const i = maze.walls.findIndex(([a, b], k) => !maze.open[k] && maze.solution.includes(a) && maze.solution.includes(b));
  expect(i).toBeGreaterThanOrEqual(0);
  const [a, b] = maze.walls[i];
  const result = checkMaze(maze, layout, [pathStroke(maze, [a, b], layout.grid)]);
  expect(result.crossings).toEqual([[a, b]]);
});

test('the page of a fixed seed is pinned', () => {
  const rect = generateMaze('7K2Q9X', RECT, 'medium');
  const circle = generateMaze('7K2Q9X', CIRCLE, 'medium');
  const pin = (m: Maze): string => pixelHash(drawMazePage(m, mazeLayout(m, 'portrait', 'right')).pixels);
  expect([pin(rect), pin(circle)]).toEqual(['7b4f433a', 'fc311f28']);
});

describe('the maze in the Puzzles view (#386)', () => {
  test('a code gives back the same maze, and a size token reads back', () => {
    const maze = generateMaze('7K2Q9X', mazePageSize('circle', 'hard', 'portrait'), 'hard');
    expect(mazeFromCode(puzzleCode(maze.id))).toEqual(maze);
    expect(parseMazeSizeToken('12X16')).toEqual({ shape: 'rectangle', width: 12, height: 16 });
    expect(() => parseMazeSizeToken('C99')).toThrow(RangeError);
    expect(() => mazeFromCode('SU-9-H-7K2Q9X')).toThrow('not a maze code');
  });

  test.each(MAZE_SHAPES.flatMap(shape => (['easy', 'medium', 'hard'] as const).flatMap(band => (['portrait', 'landscape'] as const).map(o => [shape, band, o] as const))))(
    'the %s %s size fits a %s page',
    (shape, band, orientation) => {
      const maze = generateMaze('7K2Q9X', mazePageSize(shape, band, orientation), band);
      expect(() => mazeLayout(maze, orientation, 'right')).not.toThrow();
    },
  );

  test('the answer and the check are drawn on a copy, so the page keeps no answer', () => {
    const maze = generateMaze('7K2Q9X', RECT, 'medium');
    const layout = mazeLayout(maze, 'portrait', 'right');
    const page = drawMazePage(maze, layout);
    const before = pixelHash(page.pixels);
    const answer = drawMazeAnswer(maze, layout, page);
    const [x, y] = mazeCellCentre(maze, layout.grid, maze.solution[1]);
    expect(answer.pixels[Math.round(y) * answer.width + Math.round(x)]).toBe(0);
    const [side] = sideCell(maze);
    const strokes = [pathStroke(maze, [...maze.solution.slice(0, maze.solution.indexOf(side) + 1), sideCell(maze)[1]], layout.grid)];
    const check = checkMaze(maze, layout, strokes);
    expect(mazeMarks(maze, layout.grid, check)).toHaveLength(check.wrong.length + check.crossings.length);
    drawMazeCheck(maze, layout, page, strokes, check);
    expect(pixelHash(page.pixels)).toBe(before);
  });
});
