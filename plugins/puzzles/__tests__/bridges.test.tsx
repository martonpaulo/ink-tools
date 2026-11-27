/** Bridges in the Puzzles view (#396): a size and a band, «Check» of the drawn bridges and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  bridgesAnswers,
  bridgesFromCode,
  drawBridgesPage,
  generateBridges,
  linkLine,
  puzzleCode,
  VIEW_LINK_GAP,
  type Grid,
  type InkStroke,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {BRIDGES, bridgesCopy} from '../src/games/bridges';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE = generateBridges(SEED, {width: 7, height: 7}, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const GRID = drawBridgesPage(PUZZLE, HERE.orientation, 'right').layout.grid;

/** The bridges a hand draws, `counts[e]` lines on link e, each a pen stroke between the rings. */
const drawn = (grid: Grid, counts: readonly number[]): InkStroke<object>[] =>
  bridgesAnswers(PUZZLE).flatMap(({from, to}, e) =>
    Array.from({length: counts[e]}, (_, i) => {
      const [[x0, y0], [x1, y1]] = linkLine(grid, from, to, (i - (counts[e] - 1) / 2) * grid.cell * VIEW_LINK_GAP);
      const points = Array.from({length: 21}, (__, k) => ({x: x0 + ((x1 - x0) * k) / 20, y: y0 + ((y1 - y0) * k) / 20}));
      return {points, element: {}};
    }),
  );

describe('the Bridges game (#396)', () => {
  test('is in the game list, after slitherlink and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('bridges')).toBe(ids.indexOf('slitherlink') + 1);
  });

  test('«Add Page» puts the grid of the size and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(BRIDGES, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(10)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    const code = puzzleCode(generateBridges(SEED, {width: 10, height: 10}, 'hard').id);
    await expectAdded(tree, fake, BRIDGES, code, {size: '10', band: 'hard'});
  });

  test('its page fits either orientation and hand at every size', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        for (const size of ['7', '13']) {
          expect(() => BRIDGES.create({size, band: 'easy'}, SEED, {orientation, hand})).not.toThrow();
        }
      }
    }
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(BRIDGES, fakePages({code: 'SL-7X7-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](bridgesCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» marks the one link drawn with a bridge too many, and the bridges drawn right are solved', async () => {
    expect(bridgesFromCode(CODE)).toEqual(PUZZLE);
    const counts = PUZZLE.solution.slice();
    const e = counts.findIndex(count => count === 1);
    counts[e] = 2;
    const tree = await mount(BRIDGES, fakePages({code: CODE, ink: drawn(GRID, counts)}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrong'](1));
    await expectSolved(BRIDGES, CODE, drawn(GRID, PUZZLE.solution));
  });

  test('a bridge left to draw, or a double drawn single, is nothing wrong so far, never solved', async () => {
    const counts = PUZZLE.solution.map((count, e) => (e === PUZZLE.solution.findIndex(c => c > 0) ? 0 : count));
    counts[counts.findIndex(count => count === 2)] = 1;
    const tree = await mount(BRIDGES, fakePages({code: CODE, ink: drawn(GRID, counts)}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(BRIDGES, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
