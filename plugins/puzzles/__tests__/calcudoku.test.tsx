/** Calcudoku in the Puzzles view (#388): a size, a band that size offers, «Check» and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  calcudokuFromCode,
  cellCenter,
  drawCalcudokuPage,
  encodePng,
  generateCalcudoku,
  puzzleCode,
  type Calcudoku,
  type InkStroke,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {CALCUDOKU, calcudokuCopy} from '../src/games/calcudoku';
import {playCopy} from '../src/play/copy';
import {fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE: Calcudoku = generateCalcudoku(SEED, 4, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

/** A stroke in every cell, tagged with the digit `change` makes of its solution digit. */
function written(change: (cell: number, digit: string) => string): InkStroke<object>[] {
  const {grid} = drawCalcudokuPage(PUZZLE, SHAPE).layout;
  return PUZZLE.solution.map((value, cell) => {
    const [x, y] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    return {points: [{x, y: y - grid.cell / 4}, {x, y: y + grid.cell / 4}], element: {digit: change(cell, String(value))}};
  });
}
const readDigits = (elements: object[]) => {
  const digits = elements.map(element => (element as {digit: string}).digit);
  return digits.includes('x') ? {ok: true as const, text: null} : {ok: true as const, text: digits.join(' ')};
};

describe('the calcudoku game (#388)', () => {
  test('is in the game list, after the killer sudoku', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('calcudoku')).toBe(ids.indexOf('killer-sudoku') + 1);
  });

  test('a size change drops a band it does not offer, and «Add Page» puts that puzzle on a new page', async () => {
    const {pages, inserted, calls} = fakePages();
    const tree = await mount(CALCUDOKU, pages);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    await press(tree, `${calcudokuCopy.size}: ${calcudokuCopy.sizeLabel(9)}`);
    expect(shownTexts(tree.root)).not.toContain(playCopy.bands.hard);
    await press(tree, `${calcudokuCopy.size}: ${calcudokuCopy.sizeLabel(4)}`);
    await press(tree, playCopy['new.add']);
    expect(inserted.map(page => page.code)).toEqual([CODE]);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'hide', 'insert']);
    const again = CALCUDOKU.create({size: '4', band: 'easy'}, SEED, SHAPE);
    expect(Buffer.from(inserted[0].png).equals(Buffer.from(encodePng(again.page)))).toBe(true);
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
    const right = fakePages({code: CODE, ink: written((_cell, digit) => digit), read: readDigits});
    const solved = await mount(CALCUDOKU, right.pages);
    await press(solved, playCopy['here.check']);
    expect(shownTexts(solved.root)).toContain(playCopy['verdict.solved']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(CALCUDOKU, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
