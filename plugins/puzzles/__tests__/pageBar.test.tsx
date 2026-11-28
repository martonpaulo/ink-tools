/** Puzzles' Check and Solution pictures keep clear of the note's page bar, as the page does (#577). */
import {drawKakuroPage, kakuroAnswers, kakuroFromCode, mmToPx, PAGE_MM, TONES} from '@ink-tools/puzzle-core';
import {PUZZLE_GAMES} from '../src/games';
import {KAKURO} from '../src/games/kakuro';
import {settle} from '../src/play/puzzle';
import {HERE, readDigits, SEED, writtenCells} from '../testing/gameView';

// The page bar's height, which puzzle-core's own test ties to ink-core's PAGE_BAR_PX.
const PAGE_BAR_PX = mmToPx(PAGE_MM.pageBar);
const SHAPE = {orientation: HERE.orientation, hand: 'right'} as const;
const inkedBelow = (raster: {width: number; height: number; pixels: Uint8Array}, from: number) =>
  raster.pixels.subarray(from * raster.width).findIndex(pixel => pixel !== TONES.paper);

describe('the pictures the Puzzles view shows over a page (#577)', () => {
  test.each(PUZZLE_GAMES.filter(game => game.open).map(game => [game.id, game] as const))(
    '%s: the Solution picture draws nothing in the page bar band',
    (_id, game) => {
      const {code} = game.create(settle(game.options, {}), SEED, SHAPE);
      const picture = game.open!(code, SHAPE).answer();
      expect([game.id, inkedBelow(picture, picture.height - PAGE_BAR_PX)]).toEqual([game.id, -1]);
    },
  );

  test('the Check picture, with every entry wrong and every stroke the player\'s own, draws nothing in the band', async () => {
    const puzzle = kakuroFromCode('KK-12-H-FY6ET29C');
    const grid = drawKakuroPage(puzzle, SHAPE).layout.grid;
    const wrongEverywhere = writtenCells(grid, [...kakuroAnswers(puzzle)], (_cell, digit) => String((Number(digit) % 9) + 1));
    const {check} = KAKURO.open!('KK-12-H-FY6ET29C', SHAPE);
    const verdict = await check(wrongEverywhere, async elements => readDigits(elements));
    expect(verdict.wrong).toBeGreaterThan(0);
    expect(inkedBelow(verdict.picture, verdict.picture.height - PAGE_BAR_PX)).toBe(-1);
  });
});
