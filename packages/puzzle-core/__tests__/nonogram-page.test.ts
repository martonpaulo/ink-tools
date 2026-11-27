import { createHash } from 'crypto';
import {
  assertNativeGreys,
  checkNonogram,
  countNonogramSolutions,
  digest,
  drawNonogramPage,
  generateNonogram,
  layoutNonogramPage,
  NONOGRAM_BANDS,
  PageFitError,
  type InkPoint,
  type InkStroke,
  type Nonogram,
  type PageLayout,
} from '../src';

/**
 * A nonogram on a Puzzles page (#384): the puzzle and its page are pinned for fixed seeds, and
 * «Check» reads synthetic ink the way `inkctl` writes it, a polyline per stroke in page pixels.
 */
const FOOTER = { game: 'Nonogram', difficulty: 'Medium', rule: 'Fill the cells so each row and column shows its runs, in order.' };
const PORTRAIT = { orientation: 'portrait', hand: 'right' } as const;

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

describe('a nonogram page from a fixed seed', () => {
  // Each pins the puzzle (digest), its solution count and the page's pixels. They change only when
  // generation or drawing changes on purpose.
  const PINNED = [
    ['10 x 10 easy', 'P1', { width: 10, height: 10 }, 'easy', '0618e637', '7a3dcbac2c567299'],
    ['15 x 10 medium', 'P1', { width: 15, height: 10 }, 'medium', '3fabf2b7', '83e64473027fb932'],
    ['15 x 15 hard', 'P1', { width: 15, height: 15 }, 'hard', '01d42fcd', 'adf71e50cc953f55'],
  ] as const;

  test.each(PINNED)('%s has one solution and the same puzzle and page', (_name, seed, size, band, puzzleDigest, pageDigest) => {
    const puzzle = generateNonogram(seed, size, band);
    expect(countNonogramSolutions(puzzle)).toBe(1);
    expect(digest(puzzle)).toBe(puzzleDigest);
    const page = drawNonogramPage(puzzle, layoutNonogramPage(puzzle, PORTRAIT), FOOTER);
    assertNativeGreys(page);
    expect(sha(page.pixels)).toBe(pageDigest);
  });

  test('the page holds no answer: every picture of the same clues draws the same page', () => {
    const puzzle = generateNonogram('P1', { width: 10, height: 10 }, 'easy');
    const layout = layoutNonogramPage(puzzle, PORTRAIT);
    const blank = { ...puzzle, solution: puzzle.solution.map(() => false) };
    expect(sha(drawNonogramPage(blank, layout, FOOTER).pixels)).toBe(sha(drawNonogramPage(puzzle, layout, FOOTER).pixels));
  });

  test('a 15 x 15 of every band fits a portrait page for either hand', () => {
    for (const band of NONOGRAM_BANDS) {
      for (const seed of ['S1', 'S2', 'S3']) {
        const puzzle = generateNonogram(seed, { width: 15, height: 15 }, band);
        for (const hand of ['right', 'left'] as const) {
          expect(() => layoutNonogramPage(puzzle, { orientation: 'portrait', hand })).not.toThrow();
        }
      }
    }
  });

  test('a picture too wide for the page throws PageFitError, never clips', () => {
    const puzzle = generateNonogram('P1', { width: 25, height: 25 }, 'easy');
    expect(() => layoutNonogramPage(puzzle, PORTRAIT)).toThrow(PageFitError);
  });
});

/** The square of a cell, in page pixels, inset by a share of the cell. */
function cellBox(layout: PageLayout, index: number, inset: number) {
  const { grid } = layout;
  const left = grid.x + (index % grid.columns) * grid.cell;
  const top = grid.y + Math.floor(index / grid.columns) * grid.cell;
  return { left: left + inset * grid.cell, top: top + inset * grid.cell, size: (1 - 2 * inset) * grid.cell };
}

const stroke = (points: InkPoint[]): InkStroke<null> => ({ points, element: null });

/** A shade: a zigzag across the cell, row after row, as a pen fills it. */
function shade(layout: PageLayout, index: number): InkStroke<null>[] {
  const { left, top, size } = cellBox(layout, index, 0.12);
  const lines = 8;
  const points: InkPoint[] = [];
  for (let i = 0; i <= lines; i++) {
    const y = top + (size * i) / lines;
    points.push({ x: i % 2 === 0 ? left : left + size, y }, { x: i % 2 === 0 ? left + size : left, y });
  }
  return [stroke(points)];
}

/** A cross: two diagonal strokes. */
function cross(layout: PageLayout, index: number): InkStroke<null>[] {
  const { left, top, size } = cellBox(layout, index, 0.18);
  const line = (x0: number, y0: number, x1: number, y1: number): InkPoint[] =>
    Array.from({ length: 21 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 20, y: y0 + ((y1 - y0) * i) / 20 }));
  return [stroke(line(left, top, left + size, top + size)), stroke(line(left, top + size, left + size, top))];
}

/** A dot: a small closed loop in the middle. */
function dot(layout: PageLayout, index: number): InkStroke<null>[] {
  const { left, top, size } = cellBox(layout, index, 0.45);
  return [stroke([{ x: left, y: top }, { x: left + size, y: top }, { x: left + size, y: top + size }, { x: left, y: top + size }, { x: left, y: top }])];
}

/** One straight line across the cell: neither a shade, a dot nor a cross. */
function bar(layout: PageLayout, index: number): InkStroke<null>[] {
  const { left, top, size } = cellBox(layout, index, 0.15);
  return [stroke([{ x: left, y: top + size / 2 }, { x: left + size, y: top + size / 2 }])];
}

/** The page solved: every filled cell shaded, every empty one marked, crosses and dots in turn. */
function solved(puzzle: Nonogram, layout: PageLayout, skip: ReadonlySet<number> = new Set()): InkStroke<null>[] {
  return puzzle.solution.flatMap((filled, index) =>
    skip.has(index) ? [] : filled ? shade(layout, index) : index % 2 === 0 ? cross(layout, index) : dot(layout, index),
  );
}

describe('«Check» on a nonogram page', () => {
  const puzzle = generateNonogram('P1', { width: 10, height: 10 }, 'medium');
  const layout = layoutNonogramPage(puzzle, PORTRAIT);
  const firstFilled = puzzle.solution.indexOf(true);
  const firstEmpty = puzzle.solution.indexOf(false);

  test('a right page has no wrong cell', () => {
    const result = checkNonogram(puzzle, layout, solved(puzzle, layout));
    expect(result).toEqual({ wrong: [], right: puzzle.solution.map((_, i) => i), empty: [], unread: [] });
  });

  test('one shaded empty cell is the only wrong cell', () => {
    const strokes = [...solved(puzzle, layout, new Set([firstEmpty])), ...shade(layout, firstEmpty)];
    expect(checkNonogram(puzzle, layout, strokes).wrong).toEqual([firstEmpty]);
  });

  test('one crossed filled cell is the only wrong cell', () => {
    const strokes = [...solved(puzzle, layout, new Set([firstFilled])), ...cross(layout, firstFilled)];
    expect(checkNonogram(puzzle, layout, strokes).wrong).toEqual([firstFilled]);
  });

  test('an unmarked cell is empty and other ink is unread, neither wrong', () => {
    const strokes = [...solved(puzzle, layout, new Set([firstFilled, firstEmpty])), ...bar(layout, firstEmpty)];
    const result = checkNonogram(puzzle, layout, strokes);
    expect(result.wrong).toEqual([]);
    expect(result.empty).toEqual([firstFilled]);
    expect(result.unread).toEqual([{ index: firstEmpty, reason: 'neither a shade, a dot nor a cross' }]);
  });

  test('ink off the grid is left out', () => {
    const note = stroke([{ x: 10, y: layout.footer.y }, { x: 300, y: layout.footer.y + 40 }]);
    expect(checkNonogram(puzzle, layout, [...solved(puzzle, layout), note]).wrong).toEqual([]);
  });

  test('a layout of another size is refused', () => {
    const other = layoutNonogramPage(generateNonogram('P1', { width: 15, height: 10 }, 'medium'), PORTRAIT);
    expect(() => checkNonogram(puzzle, other, [])).toThrow('the nonogram 10 x 10');
  });
});
