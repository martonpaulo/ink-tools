import {
  BRIDGES_BANDS,
  BRIDGES_SIDES,
  bridgesAnswers,
  bridgesFromCode,
  bridgesLinks,
  bridgesPageSpec,
  checkBridges,
  countBridgesSolutions,
  createPage,
  digest,
  drawBridges,
  drawBridgesPage,
  drawLinkAnswers,
  linkLine,
  generateBridges,
  layoutPage,
  parsePuzzleCode,
  puzzleCode,
  rateBridges,
  assertNativeGreys,
  cellCenter,
  type Bridges,
  type BridgesIsland,
  type Grid,
  type InkPoint,
  type InkStroke,
} from '../src';

/** The sides the Puzzles view offers, and one page-shaped grid. */
const SIZES = [...BRIDGES_SIDES.map(side => ({ width: side, height: side })), { width: 10, height: 13 }];
const SEEDS = ['A', 'B', 'C'];

/** True when every island is reached from the first over the solution's bridges. */
function connected(puzzle: Bridges): boolean {
  const links = bridgesLinks(puzzle.islands).filter((_, e) => puzzle.solution[e] > 0);
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const island = queue.pop() as number;
    for (const { from, to } of links) {
      const other = from === island ? to : to === island ? from : -1;
      if (other >= 0 && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen.size === puzzle.islands.length;
}

describe('generateBridges', () => {
  test.each(SIZES.flatMap(size => BRIDGES_BANDS.flatMap(band => SEEDS.map(seed => [size.width, size.height, band, seed] as const))))(
    'a %i x %i %s grid from seed %s has exactly one solution, and it keeps the rules',
    (width, height, band, seed) => {
      const puzzle = generateBridges(seed, { width, height }, band);
      expect(countBridgesSolutions(puzzle.islands)).toBe(1);
      expect(rateBridges(puzzle.islands)).toEqual({ difficulty: band, solution: puzzle.solution });
      const links = bridgesLinks(puzzle.islands);
      expect(puzzle.solution).toHaveLength(links.length);
      // Each island carries its number; no two islands touch; all are joined.
      puzzle.islands.forEach((island, i) => {
        const carried = links.reduce((sum, link, e) => sum + (link.from === i || link.to === i ? puzzle.solution[e] : 0), 0);
        expect(carried).toBe(island.clue);
        for (const other of puzzle.islands) {
          expect(Math.abs(other.column - island.column) + Math.abs(other.row - island.row)).not.toBe(1);
        }
      });
      expect(connected(puzzle)).toBe(true);
      // No two bridges cross.
      for (const [e, h] of links.entries()) {
        if (!h.horizontal || puzzle.solution[e] === 0) continue;
        for (const [f, v] of links.entries()) {
          if (v.horizontal || puzzle.solution[f] === 0) continue;
          const [a, b, c, d] = [puzzle.islands[h.from], puzzle.islands[h.to], puzzle.islands[v.from], puzzle.islands[v.to]];
          expect(a.column < c.column && c.column < b.column && c.row < a.row && a.row < d.row).toBe(false);
        }
      }
    },
  );

  test('the same seed gives the same grid, and fixed seeds pin their output', () => {
    expect(generateBridges('S', { width: 9, height: 9 }, 'hard')).toEqual(generateBridges('S', { width: 9, height: 9 }, 'hard'));
    expect(digest(generateBridges('P1', { width: 7, height: 7 }, 'easy'))).toBe('c1ad1b69');
    expect(digest(generateBridges('P1', { width: 13, height: 13 }, 'hard'))).toBe('9282889e');
  });

  test('its code names the game and types back', () => {
    const puzzle = generateBridges('7K2Q9X', { width: 10, height: 13 }, 'medium');
    expect(puzzleCode(puzzle.id)).toBe('BR-10X13-M-7K2Q9X');
    expect(parsePuzzleCode('br-10x13-m-7k2q9x')).toEqual(puzzle.id);
  });

  test('refuses a size or band it does not offer', () => {
    expect(() => generateBridges('S', { width: 4, height: 7 }, 'easy')).toThrow('5 to 15 cells, not 4');
    expect(() => generateBridges('S', { width: 7, height: 16 }, 'easy')).toThrow('not 16');
    expect(() => generateBridges('S', { width: 7, height: 7 }, 'expert')).toThrow('easy, medium, hard, not expert');
    expect(() => generateBridges('S', { width: 6, height: 15 }, 'hard')).toThrow('at least 7 cells a side, not 6 x 15');
  });
});

describe('the solver', () => {
  // Four 3s on a square: the doubles go round either way, so two solutions.
  const SQUARE: BridgesIsland[] = [
    { column: 0, row: 0, clue: 3 },
    { column: 2, row: 0, clue: 3 },
    { column: 0, row: 2, clue: 3 },
    { column: 2, row: 2, clue: 3 },
  ];

  test('counts every solution and rates a grid that needs a guess as none', () => {
    expect(countBridgesSolutions(SQUARE)).toBe(2);
    expect(rateBridges(SQUARE)).toBeNull();
  });

  test('the connection rule rejects the fills that leave groups apart, which makes a grid medium', () => {
    // Four 2s on a square: doubling either pair of sides leaves two groups, so only the ring is left.
    const ring: BridgesIsland[] = SQUARE.map(island => ({ ...island, clue: 2 }));
    expect(countBridgesSolutions(ring)).toBe(1);
    expect(rateBridges(ring)).toEqual({ difficulty: 'medium', solution: [1, 1, 1, 1] });
  });

  test('the counts alone finish an easy grid, and a grid with no fill has no solution', () => {
    const row = [{ column: 0, row: 0, clue: 2 }, { column: 2, row: 0, clue: 4 }, { column: 4, row: 0, clue: 2 }];
    expect(rateBridges(row)).toEqual({ difficulty: 'easy', solution: [2, 2] });
    const odd = [{ column: 0, row: 0, clue: 1 }, { column: 2, row: 0, clue: 1 }, { column: 4, row: 0, clue: 1 }];
    expect(countBridgesSolutions(odd)).toBe(0);
    expect(rateBridges(odd)).toBeNull();
  });
});

const pageGrid = (puzzle: Bridges): Grid => layoutPage(bridgesPageSpec(puzzle, 'portrait', 'right')).grid;

describe('the Bridges page', () => {
  test('draws every island in native greys, at the largest cell that fits, with its footer', () => {
    const puzzle = generateBridges('P1', { width: 10, height: 13 }, 'medium');
    expect(bridgesPageSpec(puzzle, 'portrait', 'right').cellMm).toBe(10);
    const { layout, raster } = drawBridgesPage(puzzle, 'portrait', 'right');
    assertNativeGreys(raster);
    // Each island's centre is paper inside an ink ring.
    for (const island of puzzle.islands) {
      const [x, y] = cellCenter(layout.grid, island.column, island.row);
      const ring = Math.round(x + layout.grid.cell * 0.32 - 1);
      expect(raster.pixels[Math.round(y) * raster.width + ring]).toBe(0x00);
    }
    expect(digest(Array.from(raster.pixels.filter((_, i) => i % 97 === 0)))).toBe('5589e639');
  });

  test('refuses a grid of another size', () => {
    const puzzle = generateBridges('P1', { width: 7, height: 7 }, 'easy');
    const raster = createPage(layoutPage(bridgesPageSpec(puzzle, 'portrait', 'right')));
    expect(() => drawBridges(raster, { ...pageGrid(puzzle), columns: 8 }, puzzle)).toThrow('needs a square grid of that size');
  });
});

/** The bridges of one link as the pen draws them: a line, or two lines apart, between the rings. */
function drawLink(grid: Grid, puzzle: Bridges, e: number, count: number): InkStroke<null>[] {
  const link = bridgesLinks(puzzle.islands)[e];
  const [a, b] = [puzzle.islands[link.from], puzzle.islands[link.to]];
  const [ax, ay] = cellCenter(grid, a.column, a.row);
  const [bx, by] = cellCenter(grid, b.column, b.row);
  const ring = grid.cell * 0.34;
  const offsets = count === 1 ? [0] : [-0.12 * grid.cell, 0.12 * grid.cell];
  return offsets.slice(0, count).map(off => {
    const [dx, dy] = link.horizontal ? [ring, 0] : [0, ring];
    const [ox, oy] = link.horizontal ? [0, off] : [off, 0];
    const from = { x: ax + dx + ox, y: ay + dy + oy };
    const to = { x: bx - dx + ox, y: by - dy + oy };
    // The pen's points, about 4 px apart, with a little wobble across the line.
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4);
    const points: InkPoint[] = Array.from({ length: steps + 1 }, (_, i) => {
      const wobble = ((i % 5) - 2) * 1.5;
      return {
        x: from.x + ((to.x - from.x) * i) / steps + (link.horizontal ? 0 : wobble),
        y: from.y + ((to.y - from.y) * i) / steps + (link.horizontal ? wobble : 0),
      };
    });
    return { points, element: null };
  });
}

describe('checkBridges', () => {
  const puzzle = generateBridges('P1', { width: 10, height: 13 }, 'hard');
  const grid = pageGrid(puzzle);
  const solved = (counts: readonly number[]): InkStroke<null>[] => counts.flatMap((count, e) => drawLink(grid, puzzle, e, count));

  test('a solved page has every bridge right and nothing wrong', () => {
    const result = checkBridges(grid, puzzle, solved(puzzle.solution));
    expect(result.wrong).toEqual([]);
    expect(result.empty).toEqual([]);
    expect(result.right).toHaveLength(puzzle.solution.filter(count => count > 0).length);
  });

  test('one bridge too many on a solved page marks exactly that link, and one too few is left to do', () => {
    const e = puzzle.solution.findIndex(count => count === 1);
    const counts = puzzle.solution.slice();
    counts[e] = 2;
    expect(checkBridges(grid, puzzle, solved(counts)).wrong).toEqual([e]);
    const double = puzzle.solution.findIndex(count => count === 2);
    const fewer = puzzle.solution.slice();
    fewer[double] = 1;
    expect(checkBridges(grid, puzzle, solved(fewer))).toMatchObject({ wrong: [], empty: [double] });
  });

  test('a cross marked in a one-cell gap to rule the link out is no bridge', () => {
    const e = bridgesLinks(puzzle.islands).findIndex((link, i) => {
      const [a, b] = [puzzle.islands[link.from], puzzle.islands[link.to]];
      return puzzle.solution[i] === 0 && Math.abs(a.column - b.column) + Math.abs(a.row - b.row) === 2;
    });
    expect(e).toBeGreaterThanOrEqual(0);
    const link = bridgesLinks(puzzle.islands)[e];
    const [a] = [puzzle.islands[link.from]];
    const [x, y] = cellCenter(grid, a.column + (link.horizontal ? 1 : 0), a.row + (link.horizontal ? 0 : 1));
    for (const arm of [0.2, 0.3, 0.4].map(share => share * grid.cell)) {
      const cross = [
        { points: [{ x: x - arm, y: y - arm }, { x: x + arm, y: y + arm }], element: null },
        { points: [{ x: x - arm, y: y + arm }, { x: x + arm, y: y - arm }], element: null },
      ];
      expect(checkBridges(grid, puzzle, cross).wrong).toEqual([]);
    }
  });

  test('a double bridge drawn out and back in one stroke is two, and a bridge drawn in pieces is one', () => {
    const e = puzzle.solution.findIndex(count => count === 2);
    const [first, second] = drawLink(grid, puzzle, e, 2);
    const outAndBack = { points: [...first.points, ...second.points.slice().reverse()], element: null };
    expect(checkBridges(grid, puzzle, [outAndBack]).right).toEqual([e]);
    const one = puzzle.solution.findIndex(count => count === 1);
    const [line] = drawLink(grid, puzzle, one, 1);
    const half = Math.floor(line.points.length / 2);
    const pieces = [{ points: line.points.slice(0, half), element: null }, { points: line.points.slice(half), element: null }];
    expect(checkBridges(grid, puzzle, pieces).right).toEqual([one]);
  });

  test('a bridge where the solution has none is wrong, and a missing one is empty, not wrong', () => {
    const none = puzzle.solution.findIndex(count => count === 0);
    const some = puzzle.solution.findIndex(count => count > 0);
    const counts = puzzle.solution.slice();
    counts[none] = 1;
    counts[some] = 0;
    const result = checkBridges(grid, puzzle, solved(counts));
    expect(result.wrong).toEqual([none]);
    expect(result.empty).toEqual([some]);
  });

  test('an empty page has every bridge empty, and a stroke across a link is no bridge on it', () => {
    expect(checkBridges(grid, puzzle, []).empty).toHaveLength(puzzle.solution.filter(count => count > 0).length);
    const e = bridgesLinks(puzzle.islands).findIndex((link, i) => link.horizontal && puzzle.solution[i] === 0);
    const link = bridgesLinks(puzzle.islands)[e];
    const [a] = [puzzle.islands[link.from]];
    const [x, y] = cellCenter(grid, a.column + 1, a.row);
    const across = { points: [{ x, y: y - grid.cell }, { x, y: y + grid.cell }], element: null };
    expect(checkBridges(grid, puzzle, [across]).wrong).toEqual([]);
  });
});

describe('the Bridges code and the pictures of the plugin view (#396)', () => {
  const puzzle = generateBridges('P1', { width: 7, height: 7 }, 'medium');

  test('a code names the same grid again, and another game\'s code is refused', () => {
    expect(bridgesFromCode(puzzleCode(puzzle.id))).toEqual(puzzle);
    const page = generateBridges('P1', { width: 10, height: 13 }, 'easy');
    expect(bridgesFromCode(puzzleCode(page.id))).toEqual(page);
    expect(() => bridgesFromCode('SL-7X7-E-7K2Q9X')).toThrow('not a Bridges code');
  });

  test('the answers are every link with its bridges, and a link\'s line runs between the two rings', () => {
    const answers = bridgesAnswers(puzzle);
    expect(answers.map(answer => answer.count)).toEqual(puzzle.solution);
    const grid: Grid = { lattice: 'square', x: 0, y: 0, cell: 100, columns: 7, rows: 7 };
    expect(linkLine(grid, [0, 0], [3, 0])).toEqual([[82, 50], [318, 50]]);
    expect(linkLine(grid, [0, 0], [0, 2], 10)).toEqual([[40, 82], [40, 218]]);
  });

  test('the answer is a copy in native greys that leaves each island as drawn', () => {
    const { layout, raster } = drawBridgesPage(puzzle, 'portrait', 'right');
    const before = Buffer.from(raster.pixels);
    const answered = drawLinkAnswers(raster, layout.grid, bridgesAnswers(puzzle));
    expect(Buffer.from(raster.pixels).equals(before)).toBe(true);
    expect(Buffer.from(answered.pixels).equals(before)).toBe(false);
    assertNativeGreys(answered);
    for (const island of puzzle.islands) {
      const [x, y] = cellCenter(layout.grid, island.column, island.row);
      const at = Math.round(y) * raster.width + Math.round(x);
      expect(answered.pixels[at]).toBe(raster.pixels[at]);
    }
  });
});
