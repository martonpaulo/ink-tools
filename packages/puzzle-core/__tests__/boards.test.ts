import { BOARD_GAMES, assertNativeGreys, encodePng, renderBoardPage, type BoardGame } from '../src';

/** Two-player boards (#402). Their golden images are in page.test.ts, drawn from testing/pages.ts. */
describe('the two-player boards', () => {
  it.each(BOARD_GAMES)('%s is a native-grey page of the Manta size, the same every time', (game) => {
    const first = renderBoardPage(game);
    assertNativeGreys(first);
    expect([first.width, first.height]).toEqual([1920, 2560]);
    expect(encodePng(renderBoardPage(game))).toEqual(encodePng(first));
  });

  it.each(BOARD_GAMES)('%s puts the score area and the board on opposite sides for each hand', (game) => {
    const right = renderBoardPage(game, { hand: 'right' });
    const left = renderBoardPage(game, { hand: 'left' });
    expect(Buffer.from(right.pixels).equals(Buffer.from(left.pixels))).toBe(false);
    // The two pages mirror each other's column of ink: the first ink column of one is the last block of the other.
    const inkAt = (r: typeof right, x: number): boolean => {
      for (let y = 0; y < r.height - 300; y++) if (r.pixels[y * r.width + x] !== 0xff) return true;
      return false;
    };
    const firstInk = (r: typeof right): number => { let x = 0; while (!inkAt(r, x)) x++; return x; };
    const lastInk = (r: typeof right): number => { let x = r.width - 1; while (!inkAt(r, x)) x--; return x; };
    expect(firstInk(right) + (right.width - 1 - lastInk(right))).toBe(firstInk(left) + (left.width - 1 - lastInk(left)));
  });

  it('the ultimate board has heavier lines between its nine small boards than inside them', () => {
    const r = renderBoardPage('ultimate-tic-tac-toe', { hand: 'left' });
    const darkRun = (y: number): number => {
      let best = 0;
      let run = 0;
      for (let x = 0; x < r.width; x++) {
        run = r.pixels[y * r.width + x] === 0 ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    };
    let widest = 0;
    for (let y = 0; y < r.height; y++) widest = Math.max(widest, darkRun(y));
    // A region border spans a whole small board (3 cells of 118 px) in ink.
    expect(widest).toBeGreaterThanOrEqual(3 * 118);
  });

  it('refuses a board it does not know', () => {
    expect(() => renderBoardPage('chess' as BoardGame)).toThrow(/dots-and-boxes, gomoku, ultimate-tic-tac-toe/);
  });
});
