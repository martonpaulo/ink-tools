/** Binairo in the Puzzles view (#393): a size and a band, «Check» of the marked cells and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {BINAIRO_OPEN, binairoFromCode, generateBinairo, layoutBinairoPage, newBinairo, puzzleCode, type Grid, type InkPoint, type InkStroke} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {BINAIRO, binairoCopy} from '../src/games/binairo';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE = generateBinairo(SEED, 6, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const GRID = layoutBinairoPage(PUZZLE, {orientation: HERE.orientation, hand: 'right'}).grid;
const OPEN = PUZZLE.givens.flatMap((given, cell) => (given === BINAIRO_OPEN ? [cell] : []));

const line = (from: InkPoint, to: InkPoint, steps = 20): InkPoint[] =>
  Array.from({length: steps + 1}, (_, i) => ({x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps}));
const at = (grid: Grid, cell: number, u: number, v: number): InkPoint => ({
  x: grid.x + ((cell % grid.columns) + u) * grid.cell,
  y: grid.y + (Math.floor(cell / grid.columns) + v) * grid.cell,
});
/** A hatch over the cell, as a player shades it: black. */
const shade = (grid: Grid, cell: number): InkStroke<object> => ({
  points: Array.from({length: 7}, (_, i) => line(at(grid, cell, 0.1, 0.1 + i * 0.13), at(grid, cell, 0.9, 0.15 + i * 0.13))).flat(),
  element: {},
});
/** A short dot in the cell: white. */
const dot = (grid: Grid, cell: number): InkStroke<object> => ({points: line(at(grid, cell, 0.45, 0.45), at(grid, cell, 0.55, 0.55)), element: {}});
/** Each open cell marked as `value` says: shaded for a 1, dotted for a 0. */
const marked = (cells: readonly number[], value: (cell: number) => number): InkStroke<object>[] =>
  cells.map(cell => (value(cell) === 1 ? shade(GRID, cell) : dot(GRID, cell)));
const right = (cell: number) => PUZZLE.solution[cell];

describe('the binairo game (#393)', () => {
  test('is in the game list, after Star Battle and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('binairo')).toBe(ids.indexOf('star-battle') + 1);
  });

  test('its page fits either orientation and hand at the largest size', () => {
    const largest = (BINAIRO.options[0].choices as readonly {value: string}[]).at(-1)!.value;
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        expect(() => BINAIRO.create({size: largest, band: 'easy'}, SEED, {orientation, hand})).not.toThrow();
      }
    }
  });

  test('«Add Page» puts the puzzle of the size and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(BINAIRO, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(10)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    const code = puzzleCode(newBinairo(SEED, 10, 'hard').id);
    await expectAdded(tree, fake, BINAIRO, code, {size: '10', band: 'hard'});
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(BINAIRO, fakePages({code: 'BR-7X7-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](binairoCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one cell marked the other way, and every open cell marked right is solved', async () => {
    expect(binairoFromCode(CODE)).toEqual(PUZZLE);
    const [wrong, ...rest] = OPEN;
    const tree = await mount(BINAIRO, fakePages({code: CODE, ink: [...marked(rest, right), ...marked([wrong], cell => 1 - right(cell))]}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrongFramed'](1));
    await expectSolved(BINAIRO, CODE, marked(OPEN, right));
  });

  test('part of the cells marked is nothing wrong so far, never solved', async () => {
    const tree = await mount(BINAIRO, fakePages({code: CODE, ink: marked(OPEN.slice(1), right)}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('a cell it cannot read says how to mark one', async () => {
    const slash = {points: line(at(GRID, OPEN[0], 0.2, 0.8), at(GRID, OPEN[0], 0.8, 0.2)), element: {}};
    const tree = await mount(BINAIRO, fakePages({code: CODE, ink: [...marked(OPEN.slice(1), right), slash]}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.open']} ${playCopy['verdict.unreadFramed'](1)}`);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(BINAIRO, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
