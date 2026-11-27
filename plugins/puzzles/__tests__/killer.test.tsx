/** Killer sudoku in the Puzzles view (#387): a band, «Check» and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {
  cellCenter,
  drawKillerPage,
  encodePng,
  generateKiller,
  killerFromCode,
  puzzleCode,
  type InkStroke,
  type KillerSudoku,
} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {KILLER, killerCopy} from '../src/games/killer';
import {playCopy} from '../src/play/copy';
import {fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE: KillerSudoku = generateKiller(SEED, 'medium');
const CODE = puzzleCode(PUZZLE.id);
const SHAPE = {orientation: HERE.orientation, hand: 'right' as const};

/** A stroke in each open cell, tagged with the digit `change` makes of its solution digit. */
function written(change: (cell: number, digit: string) => string): InkStroke<object>[] {
  const {grid} = drawKillerPage(PUZZLE, SHAPE).layout;
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

describe('the killer sudoku game (#387)', () => {
  test('is in the game list, after the sudoku, with every band', async () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('killer-sudoku')).toBe(ids.indexOf('sudoku') + 1);
    const tree = await mount(KILLER, fakePages().pages);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining(Object.values(playCopy.bands)));
  });

  test('«Add Page» puts the chosen killer sudoku on a new page, the same for the same seed', async () => {
    const {pages, inserted, calls} = fakePages();
    const tree = await mount(KILLER, pages);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.medium}`);
    await press(tree, playCopy['new.add']);
    expect(inserted.map(page => page.code)).toEqual([CODE]);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'hide', 'insert']);
    const again = KILLER.create({band: 'medium'}, SEED, SHAPE);
    expect(Buffer.from(inserted[0].png).equals(Buffer.from(encodePng(again.page)))).toBe(true);
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
    const right = fakePages({code: CODE, ink: written((_cell, digit) => digit), read: readDigits});
    const solved = await mount(KILLER, right.pages);
    await press(solved, playCopy['here.check']);
    expect(shownTexts(solved.root)).toContain(playCopy['verdict.solved']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(KILLER, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
