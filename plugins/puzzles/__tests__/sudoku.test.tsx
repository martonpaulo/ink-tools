/** Classic sudoku in the Puzzles view (#383): a size, a band that size offers, «Check» and «Show Solution». */
import {Image} from 'react-native';
import {act} from 'react-test-renderer';
import {MEDIA_FRAME_ID, PAGED_LIST_ID} from '@ink-tools/ui-kit';
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  drawSudokuPage,
  generateSudoku,
  puzzleCode,
  sudokuExpected,
  sudokuFromCode,
  type Sudoku,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {SUDOKU, sudokuCopy} from '../src/games/sudoku';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, readDigits, SEED, writtenCells} from '../testing/gameView';

const PUZZLE: Sudoku = generateSudoku(SEED, 4, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};
const TEXT = {game: sudokuCopy.title, difficulty: playCopy.bands.easy, rule: sudokuCopy.rule(4)};

const OPEN = [...sudokuExpected(PUZZLE)];
const GRID = drawSudokuPage(PUZZLE, {...SHAPE, text: TEXT}).layout.grid;
const written = (change?: (cell: number, digit: string) => string) => writtenCells(GRID, OPEN, change);
const openCells = OPEN.map(([cell]) => cell);

describe('the sudoku game (#383)', () => {
  test('is in the game list, after the jigsaw sudoku', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('sudoku')).toBe(ids.indexOf('jigsaw-sudoku') + 1);
  });

  test('opens at 9 x 9 with its four bands, and a 4 x 4 offers only Easy', async () => {
    const {pages} = fakePages();
    const tree = await mount(SUDOKU, pages);
    // Only 9 x 9 offers Expert, so its row shows that the view opened at 9 x 9.
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([playCopy.sizeLabel(16), playCopy.bands.expert]));
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(4)}`);
    expect(shownTexts(tree.root)).not.toContain(playCopy.bands.hard);
  });

  test('«Add Page» stays out of the scrolled choices, so the longest list never hides it', async () => {
    const tree = await mount(SUDOKU, fakePages({code: CODE}).pages);
    const [add] = pressables(tree.root, playCopy['new.add']);
    let inScroll = false;
    for (let node = add.parent; node; node = node.parent) {
      inScroll = inScroll || node.props?.testID === PAGED_LIST_ID;
    }
    expect(inScroll).toBe(false);
  });

  test('a page with no sudoku says so out of the scrolled choices, so the longest list never cuts it', async () => {
    const tree = await mount(SUDOKU, fakePages().pages);
    const list = tree.root.findByProps({testID: PAGED_LIST_ID});
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](sudokuCopy.title));
    expect(shownTexts(list)).not.toContain(playCopy['here.none'](sudokuCopy.title));
  });

  test('«Add Page» puts the chosen sudoku on a new page, the same for the same seed', async () => {
    const fake = fakePages();
    const tree = await mount(SUDOKU, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(4)}`);
    await expectAdded(tree, fake, SUDOKU, CODE, {size: '4', band: 'easy'});
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
    await expectSolved(SUDOKU, CODE, written());
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(SUDOKU, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });

  // Photo 57: the Solution picture stood at the start edge, since a flexed image with an aspectRatio is
  // sized to its height. ui-kit's MediaFrame sizes it from its own box, centred on both axes (#576).
  test('the Solution picture is shown in a MediaFrame, fitted at the page\'s proportions (#576)', async () => {
    const {pages} = fakePages({code: CODE});
    const tree = await mount(SUDOKU, pages);
    await press(tree, playCopy['here.answer']);
    const frame = tree.root.findByProps({testID: MEDIA_FRAME_ID});
    act(() => frame.props.onLayout({nativeEvent: {layout: {width: 1000, height: 1000}}}));
    const picture = tree.root.findByType(Image);
    expect(picture.props.resizeMode).toBe('contain');
    expect(picture.props.style).toEqual({width: 750, height: 1000});
  });
});
