/** The pass-and-play boards in the Puzzles view (#402): «Add Page» only, no check and no solution. */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {BOARD_GAMES, boardRule, encodePng, renderBoardPage, placedPageCode} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {BOARDS, boardsCopy} from '../src/games/boards';
import {playCopy} from '../src/play/copy';
import {fakePages, mount, press, SEED} from '../testing/gameView';

describe('the pass-and-play boards (#402)', () => {
  test('each board is in the game list, after the puzzles', () => {
    expect(GAMES.map(game => game.id).slice(-BOARD_GAMES.length)).toEqual([...BOARD_GAMES]);
    expect(BOARDS.map(board => board.title)).toEqual(BOARD_GAMES.map(game => boardsCopy.titles[game]));
    // Each board says how it is played, as its page does, so no two rows read alike.
    expect(BOARDS.map(board => board.subtitle)).toEqual(BOARD_GAMES.map(game => boardRule(game).replace(/\.$/, '')));
    // Every game's subtitle, puzzles and boards alike, ends without a full stop.
    expect(GAMES.filter(entry => entry.subtitle?.endsWith('.'))).toEqual([]);
  });

  test.each(BOARD_GAMES)('«Add Page» puts the %s board on a new page after this one', async game => {
    const board = BOARDS.find(entry => entry.id === game);
    if (!board) {throw new Error(`no ${game} board`);}
    const {pages, inserted, calls} = fakePages();
    const back = jest.fn();
    const tree = await mount(board, pages, back);
    expect(shownTexts(tree.root)).toContain(playCopy['new.noteBoard']);
    await press(tree, playCopy['new.add']);
    expect(inserted.map(page => page.code)).toEqual([placedPageCode(`${game}-${SEED}`)]);
    expect(Buffer.from(inserted[0].png).equals(Buffer.from(encodePng(renderBoardPage(game, {orientation: 'portrait', hand: 'right'}))))).toBe(true);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'hide', 'insert']);
    expect(back).toHaveBeenCalled();
  });

  test('a board page shows no «This page», «Check» or «Show Solution»', async () => {
    const {pages} = fakePages({code: `gomoku-${SEED}`});
    const tree = await mount(BOARDS[0], pages);
    const texts = shownTexts(tree.root);
    expect(texts).not.toContain(playCopy['here.caption']);
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
    expect(pressables(tree.root, playCopy['here.answer'])).toHaveLength(0);
  });
});
