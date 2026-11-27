import {
  assertNativeGreys,
  checkSlitherlink,
  countSlitherlinkSolutions,
  drawEdgeAnswers,
  drawEdgeCheck,
  drawSlitherlinkPage,
  edgeEnds,
  generateSlitherlink,
  layoutPage,
  parsePuzzleCode,
  puzzleCode,
  rateSlitherlink,
  SLITHERLINK_BANDS,
  SLITHERLINK_SIDES,
  slitherlinkEdgeKeys,
  slitherlinkFromCode,
  slitherlinkLoop,
  type Grid,
  type InkPoint,
  type InkStroke,
  type Slitherlink,
} from '../src';

/** The sides the Puzzles view offers: every band of each is tried here. */
const SIZES = SLITHERLINK_SIDES.map(side => [side, side] as const);

/** The count of each cell from the loop: its sides the loop takes. */
function countsFromLoop(puzzle: Slitherlink): number[] {
  const on = new Set(slitherlinkLoop(puzzle));
  const counts: number[] = [];
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      counts.push([`h:${c},${r}`, `h:${c},${r + 1}`, `v:${c},${r}`, `v:${c + 1},${r}`].filter(key => on.has(key)).length);
    }
  }
  return counts;
}

/** The loop's dots, walked from one dot: true when every dot has two loop edges and the walk takes them all. */
function isOneLoop(puzzle: Slitherlink): boolean {
  const ends = (key: string): [string, string] => {
    const [kind, rest] = key.split(':');
    const [c, r] = rest.split(',').map(Number);
    return kind === 'h' ? [`${c},${r}`, `${c + 1},${r}`] : [`${c},${r}`, `${c},${r + 1}`];
  };
  const loop = slitherlinkLoop(puzzle);
  const byDot = new Map<string, string[]>();
  for (const key of loop) for (const dot of ends(key)) byDot.set(dot, [...(byDot.get(dot) ?? []), key]);
  if ([...byDot.values()].some(list => list.length !== 2)) return false;
  const seen = new Set<string>();
  let edge = loop[0];
  let dot = ends(edge)[0];
  while (!seen.has(edge)) {
    seen.add(edge);
    const [a, b] = ends(edge);
    dot = a === dot ? b : a;
    edge = (byDot.get(dot) as string[]).find(next => next !== edge) as string;
  }
  return seen.size === loop.length;
}

describe('generateSlitherlink', () => {
  test.each(SIZES.flatMap(([w, h]) => SLITHERLINK_BANDS.map(band => [`${w} x ${h}`, band, w, h] as const)))(
    '%s %s has one solution, one loop, and counts that match it',
    (_name, band, width, height) => {
      for (const seed of ['S1', 'S2']) {
        const puzzle = generateSlitherlink(seed, { width, height }, band);
        expect(countSlitherlinkSolutions(width, height, puzzle.clues)).toBe(1);
        expect(rateSlitherlink(width, height, puzzle.clues)).toBe(puzzle.trials);
        expect(isOneLoop(puzzle)).toBe(true);
        const counts = countsFromLoop(puzzle);
        puzzle.clues.forEach((clue, i) => clue !== null && expect(clue).toBe(counts[i]));
        expect(puzzle.trials === 0).toBe(band === 'easy');
      }
    },
  );

  test('the same seed gives the same puzzle, and another seed another', () => {
    const a = generateSlitherlink('P1', { width: 7, height: 7 }, 'hard');
    expect(generateSlitherlink('P1', { width: 7, height: 7 }, 'hard')).toEqual(a);
    expect(generateSlitherlink('P2', { width: 7, height: 7 }, 'hard').clues).not.toEqual(a.clues);
  });

  test('pins the counts of one small puzzle', () => {
    const puzzle = generateSlitherlink('P1', { width: 5, height: 5 }, 'easy');
    expect(puzzle.clues.map(c => (c === null ? '.' : String(c))).join('')).toBe('.12....1101.12010....2.10');
  });

  test('its code names the game and size, and parses back', () => {
    const puzzle = generateSlitherlink('7K2Q', { width: 10, height: 7 }, 'medium');
    expect(puzzleCode(puzzle.id)).toBe('SL-10X7-M-7K2Q');
    expect(parsePuzzleCode('sl-10x7-m-7k2q')).toEqual(puzzle.id);
  });

  test('refuses a side out of range and a band not offered', () => {
    expect(() => generateSlitherlink('S', { width: 3, height: 5 }, 'easy')).toThrow('4 to 10');
    expect(() => generateSlitherlink('S', { width: 5, height: 11 }, 'easy')).toThrow('4 to 10');
    expect(() => generateSlitherlink('S', { width: 5, height: 5 }, 'expert')).toThrow('not expert');
  });
});

describe('countSlitherlinkSolutions', () => {
  test('counts more than one loop where the counts allow them, and none for a contradiction', () => {
    // A lone 3 in a 4 x 4 grid allows many loops.
    const clues: (number | null)[] = new Array(16).fill(null);
    clues[5] = 3;
    expect(countSlitherlinkSolutions(4, 4, clues)).toBe(2);
    expect(rateSlitherlink(4, 4, clues)).toBeNull();
    // Two 3s side by side in one corner and a 0 between their outer sides cannot both be met.
    const none: (number | null)[] = new Array(16).fill(0);
    none[0] = 3;
    expect(countSlitherlinkSolutions(4, 4, none)).toBe(0);
  });

  test('refuses counts of the wrong length or value', () => {
    expect(() => countSlitherlinkSolutions(4, 4, [1])).toThrow('16 cells');
    expect(() => countSlitherlinkSolutions(4, 4, new Array(16).fill(4))).toThrow('0 to 3');
  });
});

describe('the slitherlink page and its check', () => {
  const TEXT = { game: 'Slitherlink', difficulty: 'Easy', rule: 'Draw one loop along the dots; each number counts its sides on the loop.' };
  const puzzle = generateSlitherlink('C1', { width: 7, height: 7 }, 'easy');

  /** A pen stroke along one edge, its ends a little short of the dots, as a hand draws it. */
  function along(grid: Grid, key: string): InkStroke<null> {
    const [kind, rest] = key.split(':');
    const [c, r] = rest.split(',').map(Number);
    const x0 = grid.x + c * grid.cell;
    const y0 = grid.y + r * grid.cell;
    const [dx, dy] = kind === 'h' ? [grid.cell, 0] : [0, grid.cell];
    const points: InkPoint[] = Array.from({ length: 21 }, (_, i) => {
      const t = 0.05 + (0.9 * i) / 20;
      return { x: x0 + dx * t, y: y0 + dy * t };
    });
    return { points, element: null };
  }

  test('draws every count in native greys, in the largest preset that fits', () => {
    const { layout, raster } = drawSlitherlinkPage(puzzle, { orientation: 'portrait', hand: 'left', text: TEXT });
    assertNativeGreys(raster);
    expect(layout.grid.columns).toBe(7);
    expect(layout).toEqual(layoutPage({ orientation: 'portrait', hand: 'left', cellMm: 15, lattice: 'square', columns: 7, rows: 7 }));
  });

  test('a solved page is solved, and one wrong edge is the only edge marked', () => {
    const { layout } = drawSlitherlinkPage(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 10, text: TEXT });
    const grid = layout.grid;
    const loop = slitherlinkLoop(puzzle);
    expect(checkSlitherlink(puzzle, grid, loop.map(key => along(grid, key)))).toEqual({ wrong: [], missing: [], solved: true });

    const off = slitherlinkEdgeKeys(puzzle.width, puzzle.height).find(key => !loop.includes(key)) as string;
    const strokes = [...loop.slice(1), off].map(key => along(grid, key));
    expect(checkSlitherlink(puzzle, grid, strokes)).toEqual({ wrong: [off], missing: [loop[0]], solved: false });
  });

  test('an empty page has nothing wrong, and a grid of another size is refused', () => {
    const { layout } = drawSlitherlinkPage(puzzle, { orientation: 'landscape', hand: 'right', text: TEXT });
    const result = checkSlitherlink(puzzle, layout.grid, []);
    expect(result.wrong).toEqual([]);
    expect(result.missing).toHaveLength(slitherlinkLoop(puzzle).length);
    expect(() => checkSlitherlink(puzzle, { ...layout.grid, columns: 8 }, [])).toThrow('8 x 7');
  });

  test('a code gives its puzzle back, and another game\'s code is refused', () => {
    expect(slitherlinkFromCode(puzzleCode(puzzle.id))).toEqual(puzzle);
    const wide = generateSlitherlink('7K2Q', { width: 10, height: 7 }, 'medium');
    expect(slitherlinkFromCode(puzzleCode(wide.id))).toEqual(wide);
    expect(() => slitherlinkFromCode('KK-6-E-7K2Q9X')).toThrow('not a slitherlink code');
  });

  test('an edge key names its two dots, and a wrong key is refused', () => {
    const grid: Grid = { lattice: 'square', x: 100, y: 200, cell: 10, columns: 3, rows: 3 };
    expect(edgeEnds(grid, 'h:1,3')).toEqual([[110, 230], [120, 230]]);
    expect(edgeEnds(grid, 'v:3,0')).toEqual([[130, 200], [130, 210]]);
    expect(() => edgeEnds(grid, 'd:1,1')).toThrow('not an edge key');
  });

  test('the check and answer pictures are copies in native greys: the page stays as inserted', () => {
    const { layout, raster } = drawSlitherlinkPage(puzzle, { orientation: 'portrait', hand: 'right', cellMm: 10, text: TEXT });
    const grid = layout.grid;
    const before = Buffer.from(raster.pixels);
    const loop = slitherlinkLoop(puzzle);
    const off = slitherlinkEdgeKeys(puzzle.width, puzzle.height).find(key => !loop.includes(key)) as string;
    const checked = drawEdgeCheck(raster, grid, [along(grid, off)], [off]);
    const answered = drawEdgeAnswers(raster, grid, loop);
    expect(Buffer.from(raster.pixels).equals(before)).toBe(true);
    for (const picture of [checked, answered]) {
      assertNativeGreys(picture);
      expect(Buffer.from(picture.pixels).equals(before)).toBe(false);
    }
    // The answer draws on the loop's edges only: a count's cell centre keeps its page pixel.
    const counted = puzzle.clues.findIndex(clue => clue !== null);
    const [cx, cy] = [grid.x + (counted % puzzle.width + 0.5) * grid.cell, grid.y + (Math.floor(counted / puzzle.width) + 0.5) * grid.cell];
    const at = Math.round(cy) * raster.width + Math.round(cx);
    expect(answered.pixels[at]).toBe(raster.pixels[at]);
  });
});
