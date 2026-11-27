/** Calcudoku in the Puzzles view (#388): a size, a band that size offers, «Check» and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  calcudokuFromCode,
  drawCalcudokuPage,
  generateCalcudoku,
  puzzleCode,
  type Calcudoku,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {CALCUDOKU, calcudokuCopy} from '../src/games/calcudoku';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, readDigits, SEED, writtenCells} from '../testing/gameView';

const PUZZLE: Calcudoku = generateCalcudoku(SEED, 4, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

const OPEN = PUZZLE.solution.map((value, cell) => [cell, String(value)] as const);
const GRID = drawCalcudokuPage(PUZZLE, SHAPE).layout.grid;
const written = (change?: (cell: number, digit: string) => string) => writtenCells(GRID, OPEN, change);

describe('the calcudoku game (#388)', () => {
  test('is in the game list, after the killer sudoku', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('calcudoku')).toBe(ids.indexOf('killer-sudoku') + 1);
  });

  test('a size change drops a band it does not offer, and «Add Page» puts that puzzle on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(CALCUDOKU, fake.pages);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(9)}`);
    expect(shownTexts(tree.root)).not.toContain(playCopy.bands.hard);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(4)}`);
    await expectAdded(tree, fake, CALCUDOKU, CODE, {size: '4', band: 'easy'});
  });

  test('a page with another game offers only a new one', async () => {
    const {pages} = fakePages({code: 'FU-6-M-7K2Q9X'});
    const tree = await mount(CALCUDOKU, pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](calcudokuCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one wrong entry, names an unread one, and a page filled right is solved', async () => {
    expect(calcudokuFromCode(CODE).solution).toEqual(PUZZLE.solution);
    const marked = written((cell, digit) => (cell === 0 ? String((Number(digit) % 4) + 1) : cell === 1 ? 'x' : digit));
    const first = fakePages({code: CODE, ink: marked, read: readDigits});
    const tree = await mount(CALCUDOKU, first.pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.wrong'](1)} ${playCopy['verdict.unread'](1)}`);
    await expectSolved(CALCUDOKU, CODE, written());
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(CALCUDOKU, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
