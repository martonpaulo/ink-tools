/** Killer sudoku in the Puzzles view (#387): a band, «Check» and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  drawKillerPage,
  generateKiller,
  killerFromCode,
  puzzleCode,
  type KillerSudoku,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {KILLER, killerCopy} from '../src/games/killer';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, readDigits, SEED, writtenCells} from '../testing/gameView';

const PUZZLE: KillerSudoku = generateKiller(SEED, 'medium');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

const OPEN = PUZZLE.givens.flatMap((given, cell) => (given === 0 ? [[cell, String(PUZZLE.solution[cell])] as const] : []));
const GRID = drawKillerPage(PUZZLE, SHAPE).layout.grid;
const written = (change?: (cell: number, digit: string) => string) => writtenCells(GRID, OPEN, change);
const openCells = OPEN.map(([cell]) => cell);

describe('the killer sudoku game (#387)', () => {
  test('is in the game list, after the sudoku, with every band', async () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('killer-sudoku')).toBe(ids.indexOf('sudoku') + 1);
    const tree = await mount(KILLER, fakePages().pages);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining(Object.values(playCopy.bands)));
  });

  test('«Add Page» puts the chosen killer sudoku on a new page, the same for the same seed', async () => {
    const fake = fakePages();
    const tree = await mount(KILLER, fake.pages);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.medium}`);
    await expectAdded(tree, fake, KILLER, CODE, {band: 'medium'});
  });

  test('a page with another game offers only a new one', async () => {
    const {pages} = fakePages({code: 'SU-9-M-7K2Q9X'});
    const tree = await mount(KILLER, pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](killerCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one wrong entry, names an unread one, and a page filled right is solved', async () => {
    expect(killerFromCode(CODE).solution).toEqual(PUZZLE.solution);
    const [wrong, unread] = openCells;
    const marked = written((cell, digit) => (cell === wrong ? String((Number(digit) % 9) + 1) : cell === unread ? 'x' : digit));
    const first = fakePages({code: CODE, ink: marked, read: readDigits});
    const tree = await mount(KILLER, first.pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.wrong'](1)} ${playCopy['verdict.unread'](1)}`);
    await expectSolved(KILLER, CODE, written());
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(KILLER, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
