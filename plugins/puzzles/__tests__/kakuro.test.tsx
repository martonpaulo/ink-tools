/** Kakuro in the Puzzles view (#389): a size and a band, «Check» of the white cells and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {drawKakuroPage, generateKakuro, kakuroAnswers, kakuroFromCode, newKakuro, puzzleCode, type Kakuro} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {KAKURO, kakuroCopy} from '../src/games/kakuro';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, readDigits, SEED, writtenCells} from '../testing/gameView';

const PUZZLE: Kakuro = generateKakuro(SEED, 6, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

const OPEN = [...kakuroAnswers(PUZZLE)];
const GRID = drawKakuroPage(PUZZLE, SHAPE).layout.grid;
const written = (change?: (cell: number, digit: string) => string) => writtenCells(GRID, OPEN, change);

describe('the kakuro game (#389)', () => {
  test('is in the game list, after futoshiki and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('kakuro')).toBe(ids.indexOf('futoshiki') + 1);
  });

  test('«Add Page» puts the puzzle of the size and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(KAKURO, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(8)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.medium}`);
    await expectAdded(tree, fake, KAKURO, puzzleCode(newKakuro(SEED, 8, 'medium').id), {size: '8', band: 'medium'});
  });

  test('a page with another game offers only a new one', async () => {
    const {pages} = fakePages({code: 'CD-6-M-7K2Q9X'});
    const tree = await mount(KAKURO, pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](kakuroCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one wrong entry, names an unread one, and a page filled right is solved', async () => {
    expect(kakuroFromCode(CODE).solution).toEqual(PUZZLE.solution);
    const [first, second] = OPEN.map(([cell]) => cell);
    const marked = written((cell, digit) => (cell === first ? String((Number(digit) % 9) + 1) : cell === second ? 'x' : digit));
    const tree = await mount(KAKURO, fakePages({code: CODE, ink: marked, read: readDigits}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.wrong'](1)} ${playCopy['verdict.unread'](1)}`);
    await expectSolved(KAKURO, CODE, written());
  });

  test('ink in no white cell yet is nothing wrong so far, never solved', async () => {
    const tree = await mount(KAKURO, fakePages({code: CODE, ink: [], read: readDigits}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(KAKURO, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
