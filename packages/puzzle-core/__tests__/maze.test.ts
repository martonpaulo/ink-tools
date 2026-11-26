import { generateMaze, MAZE_BANDS, ringCellCounts, type Maze, type MazeSize } from '../src/maze';

/** A perfect maze: one passage fewer than cells, and every cell reachable. */
function perfect(maze: Maze, cells: number): boolean {
  const passages = maze.walls.filter((_, i) => maze.open[i]);
  if (passages.length !== cells - 1) return false;
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const cell = queue.pop() as number;
    for (const [a, b] of passages) {
      const other = a === cell ? b : b === cell ? a : -1;
      if (other >= 0 && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen.size === cells;
}

const RECT: MazeSize = { shape: 'rectangle', width: 20, height: 27 };
const CIRCLE: MazeSize = { shape: 'circle', rings: 12 };
const cellCount = (size: MazeSize): number =>
  size.shape === 'rectangle' ? size.width * size.height : ringCellCounts(size.rings).reduce((a, b) => a + b, 0);

describe('generateMaze', () => {
  test.each([RECT, CIRCLE].flatMap(size => MAZE_BANDS.map(band => [size.shape, band, size] as const)))(
    'a %s maze, %s, is perfect and its solution walks open passages',
    (_shape, band, size) => {
      const maze = generateMaze('BANDS', size, band);
      expect(perfect(maze, cellCount(size))).toBe(true);
      expect(maze.solution[0]).toBe(maze.start);
      expect(maze.solution[maze.solution.length - 1]).toBe(maze.end);
      const open = new Set(maze.walls.filter((_, i) => maze.open[i]).map(([a, b]) => `${a},${b}`));
      for (let i = 1; i < maze.solution.length; i++) {
        const [a, b] = [maze.solution[i - 1], maze.solution[i]].sort((x, y) => x - y);
        expect(open.has(`${a},${b}`)).toBe(true);
      }
    },
  );

  test.each([RECT, CIRCLE])('harder bands put more junctions on the path ($shape)', size => {
    const mean = (band: (typeof MAZE_BANDS)[number]): number => {
      let total = 0;
      for (let i = 0; i < 20; i++) total += generateMaze(`S${i}`, size, band).junctions;
      return total / 20;
    };
    expect(mean('easy')).toBeLessThan(mean('medium'));
    expect(mean('medium')).toBeLessThan(mean('hard'));
  });

  test('rings double outward from one centre cell', () => {
    expect(ringCellCounts(6)).toEqual([1, 6, 12, 12, 24, 24]);
  });

  test('the same seed gives the same maze', () => {
    expect(generateMaze('S', RECT, 'hard')).toEqual(generateMaze('S', RECT, 'hard'));
  });

  test('a size or band out of range is refused', () => {
    expect(() => generateMaze('S', { shape: 'rectangle', width: 3, height: 10 }, 'easy')).toThrow('4 to 80');
    expect(() => generateMaze('S', { shape: 'circle', rings: 2 }, 'easy')).toThrow('3 to 40 rings');
    expect(() => generateMaze('S', RECT, 'expert')).toThrow('not expert');
  });
});
