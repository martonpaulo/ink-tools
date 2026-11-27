/** The jigsaw sudoku in the Puzzles view (#397): a new page at a difficulty, «Check» and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  cellCenter,
  encodePng,
  generateJigsawSudoku,
  jigsawExpected,
  jigsawLayout,
  puzzleCode,
  type InkStroke,
  type JigsawSudoku,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {JIGSAW, jigsawCopy} from '../src/games/jigsaw';
import {playCopy} from '../src/play/copy';
import {fakePages, mount, press, SEED} from '../testing/gameView';

/** Generation takes about a second, so the one puzzle of these tests is made once. */
const PUZZLE: JigsawSudoku = generateJigsawSudoku(SEED, 'easy');
const CODE = puzzleCode(PUZZLE.id);

/** The digit written in a cell: one short stroke at its centre, tagged with what it says. */
const write = (cell: number, digit: string): InkStroke<{digit: string}> => {
  const {grid} = jigsawLayout();
  const [x, y] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
  return {points: [{x, y: y - grid.cell / 4}, {x, y: y + grid.cell / 4}], element: {digit}};
};

/** The tablet reads each written stroke as its digit, in order and spaced. */
const readDigits = (elements: object[]) => ({ok: true as const, text: elements.map(element => (element as {digit: string}).digit).join(' ')});

/** Every empty cell filled with its digit, but `wrong`, which gets the next one. */
const solvedInk = (wrong: number | null): InkStroke<object>[] =>
  [...jigsawExpected(PUZZLE)].map(([cell, digit]) => write(cell, cell === wrong ? String((Number(digit) % 9) + 1) : digit));

describe('the jigsaw sudoku game (#397)', () => {
  test('is in the game list, after the maze', () => {
    expect(GAMES.map(game => game.id).slice(0, 2)).toEqual(['maze', 'jigsaw-sudoku']);
  });

  test('«Add Page» puts the chosen difficulty on a new page, the same for the same seed', async () => {
    const {pages, inserted, calls} = fakePages();
    const back = jest.fn();
    const tree = await mount(JIGSAW, pages, back);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining(['Difficulty', 'Easy', 'Medium', 'Hard']));
    await press(tree, 'Difficulty: Medium');
    await press(tree, playCopy['new.add']);
    const expected = generateJigsawSudoku(SEED, 'medium');
    expect(inserted.map(page => page.code)).toEqual([puzzleCode(expected.id)]);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'hide', 'insert']);
    expect(back).toHaveBeenCalled();
    const again = JIGSAW.create({band: 'medium'}, SEED, {orientation: 'portrait', hand: 'right'});
    expect(Buffer.from(inserted[0].png).equals(Buffer.from(encodePng(again.page)))).toBe(true);
  });

  test('a page with no jigsaw sudoku offers only a new one', async () => {
    const {pages} = fakePages({code: 'MZ-10X13-E-7K2Q9X'});
    const tree = await mount(JIGSAW, pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](jigsawCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles exactly the one wrong entry of a filled page', async () => {
    const wrong = [...jigsawExpected(PUZZLE).keys()][10];
    const {pages} = fakePages({code: CODE, ink: solvedInk(wrong), read: readDigits});
    const tree = await mount(JIGSAW, pages);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([playCopy['here.title'](jigsawCopy.title, 'Easy'), CODE]));
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrong'](1));
  });

  test('a page filled right is solved, and one half filled has nothing wrong so far', async () => {
    const solved = fakePages({code: CODE, ink: solvedInk(null), read: readDigits});
    const tree = await mount(JIGSAW, solved.pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.solved']);
    const half = solvedInk(null).slice(0, 10);
    const open = fakePages({code: CODE, ink: half, read: readDigits});
    const other = await mount(JIGSAW, open.pages);
    await press(other, playCopy['here.check']);
    expect(shownTexts(other.root)).toContain(playCopy['verdict.open']);
  });

  test('an entry the tablet cannot read is named, and the page is not solved', async () => {
    const unreadable = [...jigsawExpected(PUZZLE).keys()][3];
    const read = (elements: object[]) =>
      elements.some(element => (element as {digit: string}).digit === 'x') ? {ok: true as const, text: null} : readDigits(elements);
    const ink = [...jigsawExpected(PUZZLE)].map(([cell, digit]) => write(cell, cell === unreadable ? 'x' : digit));
    const {pages} = fakePages({code: CODE, ink, read});
    const tree = await mount(JIGSAW, pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.open']} ${playCopy['verdict.unread'](1)}`);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(JIGSAW, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
