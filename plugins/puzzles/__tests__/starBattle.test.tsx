/** Star Battle in the Puzzles view (#392): a size, the stars per line and a band, «Check» of the starred cells and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {cellCenter, generateStarBattle, layoutStarBattle, newStarBattle, puzzleCode, starBattleFromCode, type Grid, type InkStroke} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {STAR_BATTLE, starBattleCopy} from '../src/games/starBattle';
import {playCopy} from '../src/play/copy';
import {offered, settle} from '../src/play/puzzle';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE = generateStarBattle(SEED, {side: 5, stars: 1}, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const GRID = layoutStarBattle(PUZZLE, {orientation: HERE.orientation, hand: 'right'}).grid;
const STARS = PUZZLE.solution.flatMap((star, cell) => (star ? [cell] : []));
const EMPTY = PUZZLE.solution.flatMap((star, cell) => (star ? [] : [cell]));

/** A five-pointed star in one stroke in each cell, as a pen draws it: each point joined to the one two ahead. */
const starred = (grid: Grid, cells: readonly number[]): InkStroke<object>[] =>
  cells.map(cell => {
    const [cx, cy] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    const points = Array.from({length: 6}, (_, i) => {
      const angle = -Math.PI / 2 + (((2 * i) % 5) * 2 * Math.PI) / 5;
      return {x: cx + 0.35 * grid.cell * Math.cos(angle), y: cy + 0.35 * grid.cell * Math.sin(angle)};
    });
    return {points, element: {}};
  });

/** A short dot in each cell: the cell is ruled out. */
const dotted = (grid: Grid, cells: readonly number[]): InkStroke<object>[] =>
  cells.map(cell => {
    const [cx, cy] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    return {points: [{x: cx - 2, y: cy - 2}, {x: cx + 2, y: cy + 2}], element: {}};
  });

describe('the Star Battle game (#392)', () => {
  test('is in the game list, after the nonogram and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('star-battle')).toBe(ids.indexOf('nonogram') + 1);
  });

  test('two stars a line are offered from 8 x 8, and a size that offers fewer bands falls to the first it offers', () => {
    const [, stars, band] = STAR_BATTLE.options;
    expect(offered(stars, {size: '7'}).map(choice => choice.value)).toEqual(['1']);
    expect(offered(stars, {size: '8'}).map(choice => choice.value)).toEqual(['1', '2']);
    expect(offered(band, {size: '10', stars: '2'}).map(choice => choice.value)).toEqual(['hard']);
    expect(settle(STAR_BATTLE.options, {size: '10', stars: '2', band: 'easy'})).toEqual({size: '10', stars: '2', band: 'hard'});
    expect(settle(STAR_BATTLE.options, {size: '6', stars: '2', band: 'medium'})).toEqual({size: '6', stars: '1', band: 'medium'});
  });

  test('a choice the earlier ones narrow says so under its values', async () => {
    const [, stars, band] = STAR_BATTLE.options;
    expect(stars.note?.({size: '7'})).toBe(starBattleCopy.starsNote(8));
    expect(stars.note?.({size: '8'})).toBeUndefined();
    expect(band.note?.({size: '9', stars: '2'})).toBe(starBattleCopy.bandsNote);
    expect(band.note?.({size: '9', stars: '1'})).toBeUndefined();
    const tree = await mount(STAR_BATTLE, fakePages().pages);
    expect(shownTexts(tree.root)).toContain(starBattleCopy.starsNote(8));
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(10)}`);
    await press(tree, `${starBattleCopy.stars}: ${starBattleCopy.starsLabel(2)}`);
    expect(shownTexts(tree.root)).toContain(starBattleCopy.bandsNote);
    expect(shownTexts(tree.root)).not.toContain(starBattleCopy.starsNote(8));
  });

  test('its page fits either orientation and hand at the largest size of each star count', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        expect(() => STAR_BATTLE.create({size: '10', stars: '1', band: 'easy'}, SEED, {orientation, hand})).not.toThrow();
        expect(() => STAR_BATTLE.create({size: '10', stars: '2', band: 'hard'}, SEED, {orientation, hand})).not.toThrow();
      }
    }
  });

  test('«Add Page» puts the puzzle of the size, stars and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(STAR_BATTLE, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(8)}`);
    await press(tree, `${starBattleCopy.stars}: ${starBattleCopy.starsLabel(2)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.medium}`);
    const code = puzzleCode(newStarBattle(SEED, {side: 8, stars: 2}, 'medium').id);
    await expectAdded(tree, fake, STAR_BATTLE, code, {size: '8', stars: '2', band: 'medium'});
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(STAR_BATTLE, fakePages({code: 'BR-7X7-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](starBattleCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one star off the answer, and the stars drawn alone are solved, dots or not', async () => {
    expect(starBattleFromCode(CODE)).toEqual(PUZZLE);
    const tree = await mount(STAR_BATTLE, fakePages({code: CODE, ink: starred(GRID, [...STARS.slice(1), EMPTY[0]])}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrong'](1));
    await expectSolved(STAR_BATTLE, CODE, starred(GRID, STARS));
    await expectSolved(STAR_BATTLE, CODE, [...starred(GRID, STARS), ...dotted(GRID, EMPTY)]);
  });

  test('part of the stars drawn is nothing wrong so far, never solved', async () => {
    const tree = await mount(STAR_BATTLE, fakePages({code: CODE, ink: [...starred(GRID, STARS.slice(1)), ...dotted(GRID, EMPTY.slice(0, 3))]}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(STAR_BATTLE, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
