/** The maze in the Puzzles view (#386): a new page from its choices, «Check» and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {act} from 'react-test-renderer';
import {RETRY_TEXT} from '@ink-tools/ui-kit';
import {BACK_LABEL} from '@ink-tools/ui-kit/controlsCopy';
import {
  encodePng,
  generateMaze,
  mazeCellCentre,
  mazeFromCode,
  mazeLayout,
  mazePageSize,
  puzzleCode,
  type InkStroke,
  type Maze,
} from '@ink-tools/puzzle-core';
import {MAZE} from '../src/games/maze';
import {playCopy} from '../src/play/copy';
import {codeOfTemplate, type PagePorts} from '../src/play/pages';
import {GAMES} from '../src/games';
import {fakePages, mount as mountGame, press, SEED} from '../testing/gameView';

const mount = (pages: PagePorts, onBack = () => {}) => mountGame(MAZE, pages, onBack);

/** The player's path through these cells, as strokes in page pixels. */
const path = (maze: Maze, cells: number[]): InkStroke<object>[] => {
  const {grid} = mazeLayout(maze, 'portrait', 'right');
  return [{points: cells.map(cell => ({x: mazeCellCentre(maze, grid, cell)[0], y: mazeCellCentre(maze, grid, cell)[1]})), element: {}}];
};

/** A cell off the solution next to it through a passage, and the solution cell it opens from. */
function sideCell(maze: Maze): [number, number] {
  const on = new Set(maze.solution);
  const i = maze.walls.findIndex(([a, b], k) => maze.open[k] && on.has(a) !== on.has(b));
  const [a, b] = maze.walls[i];
  return on.has(a) ? [a, b] : [b, a];
}

describe('the maze game (#386)', () => {
  test('is in the game list', () => {
    expect(GAMES.map(game => game.id)).toContain('maze');
  });

  test('«Add Page» closes the view, then puts the chosen maze on a new page, the same for the same seed', async () => {
    const {pages, inserted, calls} = fakePages();
    const back = jest.fn();
    const tree = await mount(pages, back);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining(['Shape', 'Rectangle', 'Circle', 'Difficulty', 'Easy', 'Medium', 'Hard']));
    await press(tree, 'Shape: Circle');
    await press(tree, 'Difficulty: Hard');
    await press(tree, playCopy['new.add']);
    const expected = generateMaze(SEED, mazePageSize('circle', 'hard', 'portrait'), 'hard');
    expect(inserted.map(page => page.code)).toEqual([puzzleCode(expected.id)]);
    // The note reload of the insert can end the view's JavaScript, so the view is closed before it.
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'hide', 'insert']);
    expect(back).toHaveBeenCalled();
    const again = MAZE.create({shape: 'circle', band: 'hard'}, SEED, {orientation: 'portrait', hand: 'right'});
    expect(Buffer.from(inserted[0].png).equals(Buffer.from(encodePng(again.page)))).toBe(true);
  });

  test('a page with no maze offers only a new one', async () => {
    const {pages} = fakePages({code: 'SU-9-H-7K2Q9X'});
    const tree = await mount(pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none']('Maze'));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles exactly the one wrong cell of the drawn path', async () => {
    const code = puzzleCode(generateMaze(SEED, mazePageSize('rectangle', 'easy', 'portrait'), 'easy').id);
    const maze = mazeFromCode(code);
    const [from, wrong] = sideCell(maze);
    const route = maze.solution.slice(0, maze.solution.indexOf(from) + 1);
    const {pages} = fakePages({code, ink: path(maze, [...route, wrong])});
    const tree = await mount(pages);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([playCopy['here.title']('Maze', 'Easy'), code]));
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrong'](1));
  });

  test('a path along the whole route is solved', async () => {
    const code = puzzleCode(generateMaze(SEED, mazePageSize('rectangle', 'easy', 'portrait'), 'easy').id);
    const maze = mazeFromCode(code);
    const {pages} = fakePages({code, ink: path(maze, maze.solution)});
    const tree = await mount(pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.solved']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const code = puzzleCode(generateMaze(SEED, mazePageSize('rectangle', 'easy', 'portrait'), 'easy').id);
    const {pages, calls} = fakePages({code});
    const tree = await mount(pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });

  test('a page the host cannot read shows the Error state, and Retry reads it again', async () => {
    const {pages, calls} = fakePages({failHere: true});
    const tree = await mount(pages);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([playCopy['error.here'], playCopy['error.hereHint']]));
    await press(tree, RETRY_TEXT);
    expect(calls.filter(call => call === 'here')).toHaveLength(2);
  });
});

test('a page that cannot go in shows its own Error, which does not blame the note', async () => {
  const {pages, calls} = fakePages();
  pages.insert = async () => ({ok: false, code: 802, message: 'Background template file does not exist!'});
  const tree = await mount(pages);
  await press(tree, playCopy['new.add']);
  // A failed insert opens the closed view again, on its Error.
  expect(calls.slice(-2)).toEqual(['hide', 'show']);
  expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([playCopy['error.add'], playCopy['error.hint']]));
  expect(shownTexts(tree.root)).not.toContain(playCopy['error.hereHint']);
});

describe('each press acts on the page on screen, not the one the view opened on (#542)', () => {
  const code = puzzleCode(generateMaze(SEED, mazePageSize('rectangle', 'easy', 'portrait'), 'easy').id);

  test('«Add Page» goes after the page on screen, not the one the view opened on', async () => {
    const {pages, inserted, turn} = fakePages();
    const tree = await mount(pages);
    turn(5);
    await press(tree, playCopy['new.add']);
    expect(inserted.map(page => page.after)).toEqual([5]);
  });

  test.each(['here.answer', 'here.check'] as const)('%s on a page turned to one with no maze shows that page instead', async label => {
    const {pages, calls, turn} = fakePages({code});
    const tree = await mount(pages);
    turn(3);
    await press(tree, playCopy[label]);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none']('Maze'));
    expect(shownTexts(tree.root)).not.toContain(playCopy['answer.note']);
    expect(calls).not.toContain('ink');
  });

  test('«Show Solution» on a page turned to another maze shows that maze\'s solution', async () => {
    const other = puzzleCode(generateMaze('9Z9Z9Z', mazePageSize('circle', 'hard', 'portrait'), 'hard').id);
    const {pages, turn} = fakePages({code});
    const tree = await mount(pages);
    turn(4, other);
    await press(tree, playCopy['here.answer']);
    // The second page read and the open of the other maze take one more turn than the press waits.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    await press(tree, BACK_LABEL);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([playCopy['here.title']('Maze', 'Hard'), other]));
  });

  test('a page that cannot be read at «Add Page» shows its Error and inserts nothing', async () => {
    const {pages, calls, failReads} = fakePages();
    const tree = await mount(pages);
    failReads(true);
    await press(tree, playCopy['new.add']);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([playCopy['error.here'], playCopy['error.hereHint']]));
    expect(calls).not.toContain('insert');
  });
});

describe('a page background names its puzzle (#386)', () => {
  test.each([
    ['user_MZ-10X13-E-7K2Q9X', 'MZ-10X13-E-7K2Q9X'],
    ['user_MZ-10X13-E-7K2Q9X.png', 'MZ-10X13-E-7K2Q9X'],
    ['style_white', null],
  ])('%s', (name, code) => {
    expect(codeOfTemplate(name)).toBe(code);
  });
});
