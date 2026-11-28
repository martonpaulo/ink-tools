/** Every game opens a page in the layout it was printed with (#573), and says when a newer Puzzles drew it. */
import {readFileSync} from 'fs';
import {join} from 'path';
import {kakuroAnswers, kakuroFromCode, placedPageCode, withPageLayout} from '@ink-tools/puzzle-core';
import {KAKURO} from '../src/games/kakuro';
import {PUZZLE_GAMES} from '../src/games';
import {openPage} from '../src/play/GameView';
import {settle} from '../src/play/puzzle';
import {shownTexts} from '@ink-tools/ui-kit/problemTest';
import {playCopy} from '../src/play/copy';
import {fakePages, HERE, mount, press, readDigits, SEED} from '../testing/gameView';

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
    // A page of layout 2, which kept the footer 0.5 mm over the bar, opens as it was printed (photo 58).
    const middle = openPage(open, placedPageCode(code, 2), HERE);
    expect(same(middle.page, withPageLayout(2, () => open(code, SHAPE)).page)).toBe(true);
    expect(same(middle.page, now.page)).toBe(false);
    // The grid moved on every game's page, so the two layouts never draw the same page.
    expect(same(old.page, now.page)).toBe(false);
  });
});

test('a page drawn by a layout this Puzzles does not know asks for a newer Puzzles, not for another page', async () => {
  const [game] = PUZZLE_GAMES.filter(candidate => candidate.open);
  const {code} = game.create(settle(game.options, {}), SEED, SHAPE);
  // layout 1 keeps the name as given: here, one a future Puzzles wrote.
  const tree = await mount(game, fakePages({code: `${code}-L4`, layout: 1}).pages);
  expect(shownTexts(tree.root)).toContain(playCopy['here.newer']);
  expect(shownTexts(tree.root)).not.toContain(playCopy['here.none'](game.title));
});

/**
 * «Check» on an old Kakuro page (#584): the page's own grid, as it was printed, with the ink placed
 * by pixel numbers read off the printed pages on the Manta, never by the layout code under test, so
 * a change to a layout cannot move the grid and the ink together. Portrait, 12 x 12, 118 px cells.
 */
const KAKURO_12 = 'KK-12-H-FY6ET29C';
const PRINTED_GRID_TOP = {1: 501, 2: 478, 3: 466} as const;
const PRINTED_GRID_LEFT = 252;
const PRINTED_CELL = 118;

describe.each([1, 2, 3] as const)('«Check» on a Kakuro page of layout %i (#584)', layout => {
  test('reads every written digit in the cell it was printed in', async () => {
    const puzzle = kakuroFromCode(KAKURO_12);
    const ink = [...kakuroAnswers(puzzle)].map(([cell, digit]) => {
      const x = PRINTED_GRID_LEFT + (cell % 12) * PRINTED_CELL + PRINTED_CELL / 2;
      const y = PRINTED_GRID_TOP[layout] + Math.floor(cell / 12) * PRINTED_CELL + PRINTED_CELL / 2;
      const reach = PRINTED_CELL * 0.25;
      return {points: [{x, y: y - reach}, {x, y: y + reach}], element: {digit}};
    });
    const first = ink[0].element as {digit: string};
    first.digit = String((Number(first.digit) % 9) + 1);
    const tree = await mount(KAKURO, fakePages({code: KAKURO_12, layout, ink, read: readDigits}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrong'](1));
  });
});

/**
 * The same page with the very strokes the Manta saved on it (#584): the 99 strokes of page 39 of
 * the tablet's test note, as `Puzzles shift5 2026-11-27.note` held them at 03:56 on 2026-11-28, in
 * page pixels, each `[x, y, x, y, ...]`. Its 89 white cells are written at the printed grid, r2c3 a
 * 6 where the answer is 5. Each cell's strokes are tagged with that cell's digit by the frozen
 * printed grid, so the test proves the layout code puts every real stroke, with its real reach
 * into the next cell, in the cell it was written in. The «13 wrong» seen on the tablet later came
 * from the page's ink, not from Check: by 04:40 the note held 25 other strokes on that page, larger
 * digits on a 177 px pitch that sit across the 118 px cells.
 */
test('«Check» reads the strokes the tablet saved on an old Kakuro page in their printed cells (#584)', async () => {
  const saved: number[][] = JSON.parse(readFileSync(join(__dirname, 'fixtures/kakuro-12-layout-1-ink.json'), 'utf8'));
  const answers = kakuroAnswers(kakuroFromCode(KAKURO_12));
  const written = new Map([...answers].map(([cell, digit]) => [cell, digit]));
  const WRITTEN_WRONG = 1 * 12 + 2;
  expect(answers.get(WRITTEN_WRONG)).toBe('5');
  written.set(WRITTEN_WRONG, '6');
  const tagged = new Set<number>();
  const ink = saved.map(flat => {
    const points = Array.from({length: flat.length / 2}, (_, i) => ({x: flat[2 * i], y: flat[2 * i + 1]}));
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const column = Math.floor(((Math.min(...xs) + Math.max(...xs)) / 2 - PRINTED_GRID_LEFT) / PRINTED_CELL);
    const row = Math.floor(((Math.min(...ys) + Math.max(...ys)) / 2 - PRINTED_GRID_TOP[1]) / PRINTED_CELL);
    const cell = row * 12 + column;
    // One digit per cell: a digit of two strokes reads as its first stroke's tag.
    const digit = tagged.has(cell) ? '' : (written.get(cell) ?? 'x');
    tagged.add(cell);
    return {points, element: {digit}};
  });
  expect(tagged).toEqual(new Set(answers.keys()));
  const tree = await mount(KAKURO, fakePages({code: KAKURO_12, layout: 1, ink, read: readDigits}).pages);
  await press(tree, playCopy['here.check']);
  expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrong'](1));
});
