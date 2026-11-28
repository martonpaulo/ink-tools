/** Light Up in the Puzzles view (#395): a size and a band, «Check» of the bulbs and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {cellCenter, drawLightUpPage, generateLightUp, lightUpFromCode, newLightUp, puzzleCode, type Grid, type InkStroke} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {LIGHT_UP, lightUpCopy} from '../src/games/lightUp';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE = generateLightUp(SEED, {width: 7, height: 7}, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const GRID = drawLightUpPage(PUZZLE, {orientation: HERE.orientation, hand: 'right'}).layout.grid;
const BULBS = PUZZLE.solution.flatMap((bulb, cell) => (bulb ? [cell] : []));
const EMPTY = PUZZLE.walls.flatMap((wall, cell) => (!wall && !PUZZLE.solution[cell] ? [cell] : []));

/** A pen circle of a third of each cell, as a player draws a bulb. */
const circled = (grid: Grid, cells: readonly number[]): InkStroke<object>[] =>
  cells.map(cell => {
    const [cx, cy] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    return {points: Array.from({length: 25}, (_, k) => ({x: cx + grid.cell * 0.3 * Math.cos((k * Math.PI) / 12), y: cy + grid.cell * 0.3 * Math.sin((k * Math.PI) / 12)})), element: {}};
  });
/** A short dot in each cell: no bulb there. */
const dotted = (grid: Grid, cells: readonly number[]): InkStroke<object>[] =>
  cells.map(cell => {
    const [cx, cy] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    return {points: [{x: cx, y: cy}, {x: cx + 3, y: cy + 2}], element: {}};
  });

describe('the Light Up game (#395)', () => {
  test('is in the game list, after hitori and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('light-up')).toBe(ids.indexOf('hitori') + 1);
  });

  test('its page fits either orientation and hand at the largest size', () => {
    const largest = (LIGHT_UP.options[0].choices as readonly {value: string}[]).at(-1)!.value;
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        expect(() => LIGHT_UP.create({size: largest, band: 'easy'}, SEED, {orientation, hand})).not.toThrow();
      }
    }
  });

  test('«Add Page» puts the puzzle of the size and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(LIGHT_UP, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(10)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    const code = puzzleCode(newLightUp(SEED, {width: 10, height: 10}, 'hard').id);
    await expectAdded(tree, fake, LIGHT_UP, code, {size: '10', band: 'hard'});
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(LIGHT_UP, fakePages({code: 'BR-7X7-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](lightUpCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» frames the one bulb off the answer, and the bulbs drawn alone are solved, dots or not', async () => {
    expect(lightUpFromCode(CODE)).toEqual(PUZZLE);
    const tree = await mount(LIGHT_UP, fakePages({code: CODE, ink: circled(GRID, [...BULBS, EMPTY[0]])}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrongFramed'](1));
    await expectSolved(LIGHT_UP, CODE, circled(GRID, BULBS));
    await expectSolved(LIGHT_UP, CODE, [...circled(GRID, BULBS), ...dotted(GRID, EMPTY)]);
  });

  test('part of the bulbs drawn is nothing wrong so far, never solved', async () => {
    const tree = await mount(LIGHT_UP, fakePages({code: CODE, ink: circled(GRID, BULBS.slice(1))}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(LIGHT_UP, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
