/**
 * «Add Page» logs its generate, draw and encode times apart (#379), for every game, so a device
 * round reads drawing and encoding without the generator.
 */
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
import {drawn, type PuzzleGame} from '../src/play/puzzle';
import {fakePages, mount, press} from '../testing/gameView';

const GAMES: readonly PuzzleGame[] = [MAZE, JIGSAW, SUDOKU, KILLER, CALCUDOKU, FUTOSHIKI, KAKURO, SLITHERLINK, BRIDGES, NONOGRAM, STAR_BATTLE, BINAIRO, HITORI, ...BOARDS];

describe('«Add Page» logs its times (#379)', () => {
  test.each(GAMES.map(game => [game.id, game] as const))('%s: one line with generate, draw and encode apart', async (_id, game) => {
    const fake = fakePages();
    const tree = await mount(game, fake.pages);
    await press(tree, playCopy['new.add']);
    const [code] = fake.inserted.map(page => page.code);
    const timed = fake.logs.filter(line => line.startsWith(`${game.id}: timed `));
    expect(timed).toHaveLength(1);
    expect(timed[0]).toMatch(new RegExp(`^${game.id}: timed ${code}: generate \\d+ ms, draw \\d+ ms, encode \\d+ ms$`));
  });

  test('drawn times only the drawing, never the making before it', () => {
    let clock = 0;
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const perf = globalThis.performance;
    // @ts-expect-error: the Date clock, so the test sets the time.
    delete globalThis.performance;
    try {
      clock = 100;
      const page = drawn('made', () => {
        clock = 140;
        return {code: 'X', page: {width: 1, height: 1, pixels: new Uint8Array(1)}};
      });
      expect(page.drawMs).toBe(40);
    } finally {
      globalThis.performance = perf;
      spy.mockRestore();
    }
  });
});
