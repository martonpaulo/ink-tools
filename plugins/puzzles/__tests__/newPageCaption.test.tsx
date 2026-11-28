/**
 * Every game view names its choices as the new page's (#549): on a puzzle page the «New page»
 * caption comes after «This page» and above the first choice, so the choices never read as the
 * open puzzle's.
 */
import {shownTexts} from '@ink-tools/ui-kit/problemTest';
import {BINAIRO} from '../src/games/binairo';
import {BOARDS} from '../src/games/boards';
import {BRIDGES} from '../src/games/bridges';
import {CALCUDOKU} from '../src/games/calcudoku';
import {FUTOSHIKI} from '../src/games/futoshiki';
import {HITORI} from '../src/games/hitori';
import {JIGSAW} from '../src/games/jigsaw';
import {KAKURO} from '../src/games/kakuro';
import {KILLER} from '../src/games/killer';
import {MAZE} from '../src/games/maze';
import {NONOGRAM} from '../src/games/nonogram';
import {SLITHERLINK} from '../src/games/slitherlink';
import {STAR_BATTLE} from '../src/games/starBattle';
import {SUDOKU} from '../src/games/sudoku';
import {playCopy} from '../src/play/copy';
import {settle, type PuzzleGame} from '../src/play/puzzle';
import {fakePages, HERE, mount, SEED} from '../testing/gameView';

const PUZZLES: readonly PuzzleGame[] = [MAZE, JIGSAW, SUDOKU, KILLER, CALCUDOKU, FUTOSHIKI, KAKURO, SLITHERLINK, BRIDGES, NONOGRAM, STAR_BATTLE, BINAIRO, HITORI];
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

describe('the «New page» caption heads the choices (#549)', () => {
  test.each(PUZZLES.filter(game => game.options.length > 0).map(game => [game.id, game] as const))(
    '%s: on its own page, «New page» sits between «This page» and the first choice',
    async (_id, game) => {
      const {code} = game.create(settle(game.options, {}), SEED, SHAPE);
      const tree = await mount(game, fakePages({code}).pages);
      const texts = shownTexts(tree.root);
      const here = texts.indexOf(playCopy['here.caption']);
      const caption = texts.indexOf(playCopy['new.caption']);
      const first = texts.indexOf(game.options[0].title);
      expect(here).toBeGreaterThanOrEqual(0);
      expect(here).toBeLessThan(caption);
      expect(caption).toBeLessThan(first);
    },
  );

  test.each(BOARDS.map(game => [game.id, game] as const))('%s: a board with no choices still shows «New page» above «Add Page»', async (_id, game) => {
    const tree = await mount(game, fakePages().pages);
    const texts = shownTexts(tree.root);
    expect(texts.indexOf(playCopy['new.caption'])).toBeGreaterThanOrEqual(0);
    expect(texts.indexOf(playCopy['new.caption'])).toBeLessThan(texts.indexOf(playCopy['new.add']));
  });
});
