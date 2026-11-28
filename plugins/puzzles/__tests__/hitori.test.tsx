/** Hitori in the Puzzles view (#394): a size and a band, «Check» of the shaded cells and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {cellCenter, generateHitori, hitoriFromCode, hitoriLayout, newHitori, puzzleCode, type Grid, type InkPoint, type InkStroke} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {HITORI, hitoriCopy} from '../src/games/hitori';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE = generateHitori(SEED, 5, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const GRID = hitoriLayout(PUZZLE, {orientation: HERE.orientation, hand: 'right'}).grid;
const SHADED = PUZZLE.solution.flatMap((black, cell) => (black ? [cell] : []));
const WHITE = PUZZLE.solution.flatMap((black, cell) => (black ? [] : [cell]));

const line = (from: InkPoint, to: InkPoint, steps = 20): InkPoint[] =>
  Array.from({length: steps + 1}, (_, i) => ({x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps}));
const at = (grid: Grid, cell: number, u: number, v: number): InkPoint => ({
  x: grid.x + ((cell % grid.columns) + u) * grid.cell,
  y: grid.y + (Math.floor(cell / grid.columns) + v) * grid.cell,
});
/** A hatch over each cell, as a player shades it. */
const shaded = (grid: Grid, cells: readonly number[]): InkStroke<object>[] =>
  cells.map(cell => ({points: Array.from({length: 7}, (_, i) => line(at(grid, cell, 0.1, 0.1 + i * 0.13), at(grid, cell, 0.9, 0.15 + i * 0.13))).flat(), element: {}}));
/** A circle round each cell's number, as a player keeps a cell white. */
const circled = (grid: Grid, cells: readonly number[]): InkStroke<object>[] =>
  cells.map(cell => {
    const [cx, cy] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    const r = grid.cell * 0.4;
    return {points: Array.from({length: 41}, (_, i) => ({x: cx + r * Math.cos((i / 40) * 2 * Math.PI), y: cy + r * Math.sin((i / 40) * 2 * Math.PI)})), element: {}};
  });

describe('the hitori game (#394)', () => {
  test('is in the game list, after binairo and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('hitori')).toBe(ids.indexOf('binairo') + 1);
  });

  test('its page fits either orientation and hand at the largest size', () => {
    const largest = (HITORI.options[0].choices as readonly {value: string}[]).at(-1)!.value;
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        expect(() => HITORI.create({size: largest, band: 'easy'}, SEED, {orientation, hand})).not.toThrow();
      }
    }
  });

  test('«Add Page» puts the puzzle of the size and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(HITORI, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(8)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    const code = puzzleCode(newHitori(SEED, 8, 'hard').id);
    await expectAdded(tree, fake, HITORI, code, {size: '8', band: 'hard'});
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(HITORI, fakePages({code: 'BR-7X7-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](hitoriCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one white cell shaded, and the shading alone is solved, circles or not', async () => {
    expect(hitoriFromCode(CODE)).toEqual(PUZZLE);
    const tree = await mount(HITORI, fakePages({code: CODE, ink: shaded(GRID, [...SHADED, WHITE[0]])}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrongFramed'](1));
    await expectSolved(HITORI, CODE, shaded(GRID, SHADED));
    await expectSolved(HITORI, CODE, [...shaded(GRID, SHADED), ...circled(GRID, WHITE)]);
  });

  test('part of the shading is nothing wrong so far, never solved', async () => {
    const tree = await mount(HITORI, fakePages({code: CODE, ink: shaded(GRID, SHADED.slice(1))}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(HITORI, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
