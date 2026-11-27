/** Slitherlink in the Puzzles view (#391): a size and a band, «Check» of the drawn loop and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  drawSlitherlinkPage,
  edgeEnds,
  generateSlitherlink,
  newSlitherlink,
  puzzleCode,
  slitherlinkEdgeKeys,
  slitherlinkFromCode,
  slitherlinkLoop,
  type Grid,
  type InkStroke,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {SLITHERLINK, slitherlinkCopy} from '../src/games/slitherlink';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE = generateSlitherlink(SEED, {width: 5, height: 5}, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const TEXT = {game: slitherlinkCopy.title, difficulty: playCopy.bands.easy, rule: slitherlinkCopy.rule};
const GRID = drawSlitherlinkPage(PUZZLE, {orientation: HERE.orientation, hand: 'right', text: TEXT}).layout.grid;
const LOOP = slitherlinkLoop(PUZZLE);

/** A pen stroke along each edge, its ends a little short of the dots, as a hand draws it. */
const drawn = (grid: Grid, keys: readonly string[]): InkStroke<object>[] =>
  keys.map(key => {
    const [[x0, y0], [x1, y1]] = edgeEnds(grid, key);
    const points = Array.from({length: 11}, (_, i) => {
      const t = 0.1 + (0.8 * i) / 10;
      return {x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t};
    });
    return {points, element: {}};
  });

describe('the slitherlink game (#391)', () => {
  test('is in the game list, after kakuro and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('slitherlink')).toBe(ids.indexOf('kakuro') + 1);
  });

  test('«Add Page» puts the puzzle of the size and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(SLITHERLINK, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(7)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    const code = puzzleCode(newSlitherlink(SEED, {width: 7, height: 7}, 'hard').id);
    await expectAdded(tree, fake, SLITHERLINK, code, {size: '7', band: 'hard'});
  });

  test('its footer fits a page of either orientation and hand at every size', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        for (const size of ['5', '10']) {
          expect(() => SLITHERLINK.create({size, band: 'easy'}, SEED, {orientation, hand})).not.toThrow();
        }
      }
    }
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(SLITHERLINK, fakePages({code: 'KK-6-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](slitherlinkCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» rings the one edge drawn off the loop, and the loop drawn alone is solved', async () => {
    expect(slitherlinkFromCode(CODE)).toEqual(PUZZLE);
    const off = slitherlinkEdgeKeys(PUZZLE.width, PUZZLE.height).find(key => !LOOP.includes(key)) as string;
    const tree = await mount(SLITHERLINK, fakePages({code: CODE, ink: drawn(GRID, [...LOOP, off])}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrong'](1));
    await expectSolved(SLITHERLINK, CODE, drawn(GRID, LOOP));
  });

  test('part of the loop drawn is nothing wrong so far, never solved', async () => {
    const tree = await mount(SLITHERLINK, fakePages({code: CODE, ink: drawn(GRID, LOOP.slice(1))}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(SLITHERLINK, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
