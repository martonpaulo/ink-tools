/**
 * «This page» names the puzzle's size for every game with a size choice (#545), as the size list
 * labels it, and no size for a game without one.
 */
import {shownTexts} from '@ink-tools/ui-kit/problemTest';
import {parsePuzzleCode} from '@ink-tools/puzzle-core';
import {BINAIRO} from '../src/games/binairo';
import {BRIDGES} from '../src/games/bridges';
import {CALCUDOKU} from '../src/games/calcudoku';
import {FUTOSHIKI} from '../src/games/futoshiki';
import {HITORI} from '../src/games/hitori';
import {JIGSAW} from '../src/games/jigsaw';
import {KAKURO} from '../src/games/kakuro';
import {KILLER} from '../src/games/killer';
import {LIGHT_UP} from '../src/games/lightUp';
import {MAZE} from '../src/games/maze';
import {NONOGRAM} from '../src/games/nonogram';
import {SLITHERLINK} from '../src/games/slitherlink';
import {STAR_BATTLE} from '../src/games/starBattle';
import {SUDOKU} from '../src/games/sudoku';
import {playCopy} from '../src/play/copy';
import {offered, settle, type PuzzleGame} from '../src/play/puzzle';
import {fakePages, HERE, mount, SEED} from '../testing/gameView';

const SIZED: readonly PuzzleGame[] = [SUDOKU, CALCUDOKU, FUTOSHIKI, KAKURO, SLITHERLINK, BRIDGES, NONOGRAM, STAR_BATTLE, BINAIRO, HITORI, LIGHT_UP];
const UNSIZED: readonly PuzzleGame[] = [MAZE, JIGSAW, KILLER];
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

/** «This page» of a page `game` made from `choices`: the row's title. */
async function rowOf(game: PuzzleGame, choices: Record<string, string>) {
  const {code} = game.create(settle(game.options, choices), SEED, SHAPE);
  const tree = await mount(game, fakePages({code}).pages);
  const band = playCopy.bands[parsePuzzleCode(code).difficulty];
  return {texts: shownTexts(tree.root), band};
}

describe('«This page» names the puzzle size (#545)', () => {
  test.each(SIZED.map(game => [game.id, game] as const))('%s: shows the size of a page of its second size', async (_id, game) => {
    const size = game.options.find(option => option.id === 'size');
    expect(size).toBeDefined();
    // The second size, so a size the view only took from its defaults would show the wrong one.
    const choice = offered(size!, {})[1];
    const {texts, band} = await rowOf(game, {size: choice.value});
    expect(texts).toContain(playCopy['here.title'](game.title, band, choice.label));
  });

  test.each(UNSIZED.map(game => [game.id, game] as const))('%s: a game with no size choice shows no size', async (_id, game) => {
    expect(game.options.some(option => option.id === 'size')).toBe(false);
    const {texts, band} = await rowOf(game, {});
    expect(texts).toContain(playCopy['here.title'](game.title, band));
  });
});
