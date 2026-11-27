/** Classic sudoku in the Puzzles view (#383): a size, a band that size offers, «Check» and «Show Solution». */
import {ScrollView} from 'react-native';
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  cellCenter,
  drawSudokuPage,
  encodePng,
  generateSudoku,
  puzzleCode,
  sudokuFromCode,
  type InkStroke,
  type Sudoku,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {SUDOKU, sudokuCopy} from '../src/games/sudoku';
import {playCopy} from '../src/play/copy';
import {fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE: Sudoku = generateSudoku(SEED, 4, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};
const TEXT = {game: sudokuCopy.title, difficulty: playCopy.bands.easy, rule: sudokuCopy.rule(4)};

/** A stroke in each open cell, tagged with the number `change` makes of its solution number. */
function written(change: (cell: number, value: string) => string): InkStroke<object>[] {
  const {grid} = drawSudokuPage(PUZZLE, {...SHAPE, text: TEXT}).layout;
  return PUZZLE.givens.flatMap((given, cell) => {
    if (given !== 0) {return [];}
    const [x, y] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    return [{points: [{x, y: y - grid.cell / 4}, {x, y: y + grid.cell / 4}], element: {digit: change(cell, String(PUZZLE.solution[cell]))}}];
  });
}
const readDigits = (elements: object[]) => {
  const digits = elements.map(element => (element as {digit: string}).digit);
  return digits.includes('x') ? {ok: true as const, text: null} : {ok: true as const, text: digits.join(' ')};
};
const openCells = PUZZLE.givens.flatMap((given, cell) => (given === 0 ? [cell] : []));

describe('the sudoku game (#383)', () => {
  test('is in the game list, after the jigsaw sudoku', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('sudoku')).toBe(ids.indexOf('jigsaw-sudoku') + 1);
  });

  test('opens at 9 x 9 with its four bands, and a 4 x 4 offers only Easy', async () => {
    const {pages} = fakePages();
    const tree = await mount(SUDOKU, pages);
    // Only 9 x 9 offers Expert, so its row shows that the view opened at 9 x 9.
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([sudokuCopy.sizeLabel(16), playCopy.bands.expert]));
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    await press(tree, `${sudokuCopy.size}: ${sudokuCopy.sizeLabel(4)}`);
    expect(shownTexts(tree.root)).not.toContain(playCopy.bands.hard);
  });

  test('«Add Page» stays out of the scrolled choices, so the longest list never hides it', async () => {
    const tree = await mount(SUDOKU, fakePages({code: CODE}).pages);
    const [add] = pressables(tree.root, playCopy['new.add']);
    let inScroll = false;
    for (let node = add.parent; node; node = node.parent) {
      inScroll = inScroll || node.type === ScrollView;
    }
    expect(inScroll).toBe(false);
  });

  test('«Add Page» puts the chosen sudoku on a new page, the same for the same seed', async () => {
    const {pages, inserted, calls} = fakePages();
    const tree = await mount(SUDOKU, pages);
    await press(tree, `${sudokuCopy.size}: ${sudokuCopy.sizeLabel(4)}`);
    await press(tree, playCopy['new.add']);
    expect(inserted.map(page => page.code)).toEqual([CODE]);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'hide', 'insert']);
    const again = SUDOKU.create({size: '4', band: 'easy'}, SEED, SHAPE);
    expect(Buffer.from(inserted[0].png).equals(Buffer.from(encodePng(again.page)))).toBe(true);
  });

  test('a page with another game offers only a new one', async () => {
    const {pages} = fakePages({code: 'JS-9-E-7K2Q9X'});
    const tree = await mount(SUDOKU, pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](sudokuCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one wrong entry, names an unread one, and a page filled right is solved', async () => {
    expect(sudokuFromCode(CODE).solution).toEqual(PUZZLE.solution);
    const [wrong, unread] = openCells;
    const marked = written((cell, value) => (cell === wrong ? String((Number(value) % 4) + 1) : cell === unread ? 'x' : value));
    const first = fakePages({code: CODE, ink: marked, read: readDigits});
    const tree = await mount(SUDOKU, first.pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.wrong'](1)} ${playCopy['verdict.unread'](1)}`);
    const right = fakePages({code: CODE, ink: written((_cell, value) => value), read: readDigits});
    const solved = await mount(SUDOKU, right.pages);
    await press(solved, playCopy['here.check']);
    expect(shownTexts(solved.root)).toContain(playCopy['verdict.solved']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(SUDOKU, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
