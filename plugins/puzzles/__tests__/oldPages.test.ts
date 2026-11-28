/** Every game opens a page in the layout it was printed with (#573). */
import {placedPageCode, withPageLayout} from '@ink-tools/puzzle-core';
import {PUZZLE_GAMES} from '../src/games';
import {openPage} from '../src/play/GameView';
import {settle} from '../src/play/puzzle';
import {HERE, SEED} from '../testing/gameView';

const SHAPE = {orientation: HERE.orientation, hand: 'right'} as const;
const same = (a: {pixels: Uint8Array}, b: {pixels: Uint8Array}) => Buffer.from(a.pixels).equals(Buffer.from(b.pixels));

describe('a page made before the page bar margin (#573)', () => {
  test.each(PUZZLE_GAMES.filter(game => game.open).map(game => [game.id, game] as const))('%s opens in its printed layout, a new page in the current one', (_id, game) => {
    const open = game.open!;
    const {code} = game.create(settle(game.options, {}), SEED, SHAPE);
    const old = openPage(open, code, HERE);
    const now = openPage(open, placedPageCode(code), HERE);
    expect([old.code, now.code]).toEqual([code, placedPageCode(code)]);
    expect(same(old.page, withPageLayout(1, () => open(code, SHAPE)).page)).toBe(true);
    expect(same(now.page, open(code, SHAPE).page)).toBe(true);
    // The grid moved on every game's page, so the two layouts never draw the same page.
    expect(same(old.page, now.page)).toBe(false);
  });
});
