import glyphData from './fixtures/inkctl-glyphs.json';
import {
  assertNativeGreys,
  cellCenter,
  checkJigsaw,
  countJigsawSolutions,
  digest,
  drawCellAnswers,
  drawCellCheck,
  drawJigsawPage,
  generateJigsawSudoku,
  JIGSAW_CLUES,
  jigsawExpected,
  jigsawFromCode,
  jigsawLayout,
  parsePuzzleCode,
  puzzleCode,
  solveJigsaw,
  validRegions,
  type InkStroke,
  type ReadText,
} from '../src';

const GLYPHS = glyphData.glyphs as unknown as Record<string, number[][][]>;

/** The digit as inkctl draws it, centred in a cell of the page's grid, its strokes tagged with it. */
type Tag = { ch: string };
function write(cell: number, ch: string): InkStroke<Tag>[] {
  const { grid } = jigsawLayout();
  const strokes = GLYPHS[ch];
  const pts = strokes.flat();
  const scale = (0.7 * grid.cell) / 90;
  const [minX, maxX] = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))];
  const [cx, cy] = cellCenter(grid, cell % 9, Math.floor(cell / 9));
  const left = cx - ((maxX - minX) * scale) / 2 - minX * scale;
  const tag = { ch };
  return strokes.map(s => ({ points: s.map(([x, y]) => ({ x: left + x * scale, y: cy - 45 * scale + y * scale })), element: tag }));
}

const made = new Map<string, ReturnType<typeof generateJigsawSudoku>>();
/** Generation takes about a second, so each seed and band is made once per run. */
const generate = (seed: string, band: 'easy' | 'medium' | 'hard') => {
  const key = `${seed}/${band}`;
  if (!made.has(key)) made.set(key, generateJigsawSudoku(seed, band));
  return made.get(key) as ReturnType<typeof generateJigsawSudoku>;
};

describe('jigsaw sudoku generation', () => {
  test.each(['easy', 'medium', 'hard'] as const)('a %s puzzle has valid regions, one solution and its clue count', difficulty => {
    const puzzle = generate('FIXTURE', difficulty);
    expect(validRegions(puzzle.regions)).toBe(true);
    expect(countJigsawSolutions(puzzle.regions, puzzle.givens)).toBe(1);
    expect(solveJigsaw(puzzle.regions, puzzle.givens)).toEqual(puzzle.solution);
    expect(puzzle.givens.filter(Boolean).length).toBeLessThanOrEqual(JIGSAW_CLUES[difficulty]);
    puzzle.givens.forEach((g, i) => g && expect(g).toBe(puzzle.solution[i]));
  });

  test('the solution fills every row, column and region once', () => {
    const { regions, solution } = generate('FIXTURE', 'easy');
    const units = [
      ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
      ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
      ...Array.from({ length: 9 }, (_, g) => regions.flatMap((o, i) => (o === g ? [i] : []))),
    ];
    for (const unit of units) expect(new Set(unit.map(i => solution[i])).size).toBe(9);
  });

  test('the same seed gives the same puzzle, another seed another', () => {
    expect(digest(generateJigsawSudoku('P1', 'medium'))).toBe(digest(generate('P1', 'medium')));
    expect(digest(generate('P1', 'medium'))).not.toBe(digest(generate('P2', 'medium')));
  });

  test('pins the output for fixed seeds', () => {
    expect(digest(generate('P1', 'easy'))).toBe('c3cd3f10');
    expect(digest(generate('P1', 'hard'))).toBe('5d8edc93');
  });

  test('a removed clue that breaks uniqueness is counted as more than one solution', () => {
    const { regions, solution } = generate('FIXTURE', 'easy');
    expect(countJigsawSolutions(regions, new Array(81).fill(0))).toBe(2);
    const bad = solution.slice();
    bad[0] = bad[1];
    expect(countJigsawSolutions(regions, bad)).toBe(0);
  });

  test('seeds whose regions never grew, or whose first layout filled slowly, give a puzzle (#397)', () => {
    for (const seed of ['7K2Q9X', '2DB3', 'YY9']) expect(validRegions(generateJigsawSudoku(seed, 'easy').regions)).toBe(true);
  });

  test('a band not offered throws, and the code round-trips', () => {
    expect(() => generateJigsawSudoku('P1', 'expert')).toThrow('offers');
    const { id } = generate('P1', 'easy');
    expect(parsePuzzleCode(puzzleCode(id))).toEqual(id);
    expect(puzzleCode(id)).toMatch(/^JS-9-E-/);
  });
});

describe('the jigsaw page and «Check»', () => {
  test('the page draws only native greys', () => {
    assertNativeGreys(drawJigsawPage(generate('P1', 'easy')));
  });

  test('the solution is never on the page: the pages of two puzzles with equal givens match', () => {
    const puzzle = generate('P1', 'easy');
    const other = { ...puzzle, solution: puzzle.solution.map(v => (v % 9) + 1) };
    expect(Buffer.from(drawJigsawPage(other).pixels).equals(Buffer.from(drawJigsawPage(puzzle).pixels))).toBe(true);
  });

  test('marks exactly the one wrong entry of a solved page', async () => {
    const puzzle = generate('P1', 'easy');
    const empty = puzzle.givens.flatMap((g, i) => (g ? [] : [i]));
    const wrongCell = empty[Math.floor(empty.length / 2)];
    const strokes = empty.flatMap(cell => write(cell, String(cell === wrongCell ? (puzzle.solution[cell] % 9) + 1 : puzzle.solution[cell])));
    // The recogniser reads each written digit back once, in order, spaced.
    const recognize = async (elements: Tag[]): Promise<ReadText> => {
      const seen = elements.filter((tag, k) => elements.indexOf(tag) === k);
      return { ok: true, text: seen.length ? seen.map(tag => tag.ch).join(' ') : null };
    };
    const result = await checkJigsaw(puzzle, strokes, recognize);
    expect(result.wrong).toEqual([wrongCell]);
    expect(result.right.length).toBe(empty.length - 1);
  });
});

describe('the jigsaw code and the pictures of the plugin view (#397)', () => {
  test('a code names the same puzzle again, and another game\'s code is refused', () => {
    const puzzle = generate('P1', 'easy');
    expect(digest(jigsawFromCode(puzzleCode(puzzle.id)))).toBe(digest(puzzle));
    expect(() => jigsawFromCode('MZ-10X13-E-7K2Q9X')).toThrow('not a jigsaw sudoku code');
  });

  test('the check and answer pictures are copies in native greys: the page stays as inserted', () => {
    const puzzle = generate('P1', 'easy');
    const page = drawJigsawPage(puzzle);
    const before = Buffer.from(page.pixels);
    const { grid } = jigsawLayout();
    const wrong = [...jigsawExpected(puzzle).keys()][0];
    const checked = drawCellCheck(page, grid, write(wrong, '1'), [wrong]);
    const answered = drawCellAnswers(page, grid, jigsawExpected(puzzle));
    expect(Buffer.from(page.pixels).equals(before)).toBe(true);
    assertNativeGreys(checked);
    assertNativeGreys(answered);
    expect(Buffer.from(checked.pixels).equals(before)).toBe(false);
    expect(Buffer.from(answered.pixels).equals(before)).toBe(false);
  });

  test('the answer writes in the empty cells only: a given cell keeps its pixels', () => {
    const puzzle = generate('P1', 'easy');
    const page = drawJigsawPage(puzzle);
    const { grid } = jigsawLayout();
    const answered = drawCellAnswers(page, grid, jigsawExpected(puzzle));
    const given = puzzle.givens.findIndex(Boolean);
    const [cx, cy] = cellCenter(grid, given % 9, Math.floor(given / 9));
    const half = Math.floor(grid.cell / 2) - 4;
    for (let y = cy - half; y < cy + half; y++) {
      for (let x = cx - half; x < cx + half; x++) {
        const at = Math.round(y) * page.width + Math.round(x);
        expect(answered.pixels[at]).toBe(page.pixels[at]);
      }
    }
  });
});
