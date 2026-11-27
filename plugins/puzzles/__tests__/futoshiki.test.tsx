/** Futoshiki in the Puzzles view (#390): a size, a band that size offers, «Check» and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  cellCenter,
  drawFutoshikiPage,
  encodePng,
  futoshikiFromCode,
  generateFutoshiki,
  puzzleCode,
  type Futoshiki,
  type InkStroke,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {FUTOSHIKI, futoshikiCopy} from '../src/games/futoshiki';
import {playCopy} from '../src/play/copy';
import {fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE: Futoshiki = generateFutoshiki(SEED, 4, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

/** A stroke in each open cell, tagged with the digit `change` makes of its solution digit. */
function written(change: (cell: number, digit: string) => string): InkStroke<object>[] {
  const {grid} = drawFutoshikiPage(PUZZLE, SHAPE).layout;
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

describe('the futoshiki game (#390)', () => {
  test('is in the game list, after the jigsaw sudoku', () => {
    expect(GAMES.map(game => game.id).slice(0, 3)).toEqual(['maze', 'jigsaw-sudoku', 'futoshiki']);
  });

  test('a size change drops a band it does not offer, and «Add Page» puts that puzzle on a new page', async () => {
    const {pages, inserted, calls} = fakePages();
    const tree = await mount(FUTOSHIKI, pages);
    expect(shownTexts(tree.root)).not.toContain(playCopy.bands.hard);
    await press(tree, `${futoshikiCopy.size}: ${futoshikiCopy.sizeLabel(7)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    await press(tree, `${futoshikiCopy.size}: ${futoshikiCopy.sizeLabel(5)}`);
    expect(shownTexts(tree.root)).not.toContain(playCopy.bands.hard);
    await press(tree, playCopy['new.add']);
    const expected = generateFutoshiki(SEED, 5, 'easy');
    expect(inserted.map(page => page.code)).toEqual([puzzleCode(expected.id)]);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'hide', 'insert']);
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
    const right = fakePages({code: CODE, ink: written((_cell, digit) => digit), read: readDigits});
    const solved = await mount(FUTOSHIKI, right.pages);
    await press(solved, playCopy['here.check']);
    expect(shownTexts(solved.root)).toContain(playCopy['verdict.solved']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(FUTOSHIKI, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf']);
  });
});
