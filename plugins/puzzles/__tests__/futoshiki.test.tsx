/** Futoshiki in the Puzzles view (#390): a size, a band that size offers, «Check» and «Show Solution». */
import {act} from 'react-test-renderer';
import {BACK_LABEL} from '@ink-tools/ui-kit/controlsCopy';
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  drawFutoshikiPage,
  encodePng,
  futoshikiFromCode,
  generateFutoshiki,
  parsePuzzleCode,
  placedPageCode,
  puzzleCode,
  type Futoshiki,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {FUTOSHIKI, futoshikiCopy} from '../src/games/futoshiki';
import {playCopy} from '../src/play/copy';
import type {PuzzleGame} from '../src/play/puzzle';
import {expectSolved, fakePages, HERE, mount, press, readDigits, SEED, writtenCells} from '../testing/gameView';

const PUZZLE: Futoshiki = generateFutoshiki(SEED, 4, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

const OPEN = PUZZLE.givens.flatMap((given, cell) => (given === 0 ? [[cell, String(PUZZLE.solution[cell])] as const] : []));
const GRID = drawFutoshikiPage(PUZZLE, SHAPE).layout.grid;
const written = (change?: (cell: number, digit: string) => string) => writtenCells(GRID, OPEN, change);
const openCells = OPEN.map(([cell]) => cell);

describe('the futoshiki game (#390)', () => {
  test('is in the game list, after the jigsaw sudoku', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('futoshiki')).toBeGreaterThan(ids.indexOf('jigsaw-sudoku'));
  });

  test('a size change drops a band it does not offer, and «Add Page» puts that puzzle on a new page', async () => {
    const {pages, inserted, calls} = fakePages();
    const tree = await mount(FUTOSHIKI, pages);
    expect(shownTexts(tree.root)).not.toContain(playCopy.bands.hard);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(7)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(5)}`);
    expect(shownTexts(tree.root)).not.toContain(playCopy.bands.hard);
    await press(tree, playCopy['new.add']);
    const expected = generateFutoshiki(SEED, 5, 'easy');
    expect(inserted.map(page => page.code)).toEqual([placedPageCode(puzzleCode(expected.id))]);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'hide', 'insert']);
    const again = FUTOSHIKI.create({size: '5', band: 'easy'}, SEED, SHAPE);
    expect(Buffer.from(inserted[0].png).equals(Buffer.from(encodePng(again.page)))).toBe(true);
  });

  test('a page with another game offers only a new one', async () => {
    const {pages} = fakePages({code: 'MZ-10X13-E-7K2Q9X'});
    const tree = await mount(FUTOSHIKI, pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](futoshikiCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one wrong entry, names an unread one, and a page filled right is solved', async () => {
    expect(futoshikiFromCode(CODE).solution).toEqual(PUZZLE.solution);
    const wrong = openCells[0];
    const unread = openCells[1];
    const marked = written((cell, digit) => (cell === wrong ? String((Number(digit) % 4) + 1) : cell === unread ? 'x' : digit));
    const first = fakePages({code: CODE, ink: marked, read: readDigits});
    const tree = await mount(FUTOSHIKI, first.pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.wrong'](1)} ${playCopy['verdict.unread'](1)}`);
    await expectSolved(FUTOSHIKI, CODE, written());
  });

  test('the log names each unread cell and what the recognizer read there, never the screen (#584)', async () => {
    const unread = openCells[1];
    const {pages, lines} = fakePages({code: CODE, ink: written((cell, digit) => (cell === unread ? 'x' : digit)), read: readDigits});
    const tree = await mount(FUTOSHIKI, pages);
    await press(tree, playCopy['here.check']);
    const at = `r${Math.floor(unread / GRID.columns) + 1}c${(unread % GRID.columns) + 1}`;
    expect(lines).toContain(`futoshiki: unread ${at}: read «X», not a digit`);
    expect(shownTexts(tree.root).join(' ')).not.toContain('not a digit');
  });

  test('the log tells that Check was pressed and how long the puzzle then took to make (tablet row 146, #595)', async () => {
    const {pages, lines} = fakePages({code: CODE});
    const tree = await mount(FUTOSHIKI, pages);
    await press(tree, playCopy['here.check']);
    const pressed = lines.findIndex(line => line.startsWith(`futoshiki: check pressed on ${CODE}`));
    const opened = lines.findIndex(line => new RegExp(`^futoshiki: opened ${CODE}(-L\\d+)? in \\d+ ms$`).test(line));
    expect([pressed >= 0, opened > pressed]).toEqual([true, true]);
  });

  test('«Check» shows before the puzzle is made, and its press makes it under «Preparing the puzzle…» (#595)', async () => {
    // A code no bank holds is made again from its seed when opened: 15 s for a 7 x 7 hard on the
    // tablet, which held the view on «Loading…» with no Check to press (tablet row 148).
    let made = 0;
    const counted: PuzzleGame = {
      ...FUTOSHIKI,
      open: (code, shape) => {
        made++;
        return FUTOSHIKI.open!(code, shape);
      },
    };
    const {pages} = fakePages({code: CODE, ink: written(), read: readDigits});
    const tree = await mount(counted, pages);
    expect(made).toBe(0);
    const [control] = pressables(tree.root, playCopy['here.check']);
    expect(control).toBeDefined();
    const settle = async () => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    };
    jest.useFakeTimers();
    try {
      await act(async () => {
        control.props.onPress();
        await settle();
      });
      expect(shownTexts(tree.root)).toContain(playCopy['here.preparing']);
      expect(shownTexts(tree.root)).not.toContain('Loading…');
      expect(made).toBe(0);
      await act(async () => {
        jest.runAllTimers();
        await settle();
      });
    } finally {
      jest.useRealTimers();
    }
    expect(made).toBe(1);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.solved']);
    // Back and a second press use the puzzle made once.
    await press(tree, BACK_LABEL);
    await press(tree, playCopy['here.answer']);
    expect(made).toBe(1);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
  });

  test('a new 7 x 7 hard page comes from the seed bank, so its code makes it again at once (#595)', () => {
    const made = FUTOSHIKI.create({size: '7', band: 'hard'}, SEED, SHAPE);
    // A bank entry's seed is B and a counter, never the 8 characters of a fresh seed (seed-bank.cjs).
    expect(parsePuzzleCode(made.code).seed).toMatch(/^B[0-9A-Z]{1,2}$/);
    expect(Buffer.from(encodePng(FUTOSHIKI.open!(made.code, SHAPE).page)).equals(Buffer.from(encodePng(made.page)))).toBe(true);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(FUTOSHIKI, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
