/** The maze in the Puzzles view (#386): a new page from its choices, «Check» and «Show Solution». */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {RETRY_TEXT} from '@ink-tools/ui-kit';
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
import {GameView} from '../src/play/GameView';
import {playCopy} from '../src/play/copy';
import {codeOfTemplate, type Here, type PagePorts} from '../src/play/pages';
import {GAMES} from '../src/games';

const SEED = '7K2Q9X';
const HERE: Here = {notePath: '/storage/emulated/0/Note/Puzzles.note', page: 2, size: {width: 1920, height: 2560}, orientation: 'portrait'};

/** Fake pages: `code` is the puzzle the current page holds; every call is recorded. */
function fakePages({code = null as string | null, ink = [] as InkStroke<object>[], failHere = false} = {}) {
  const calls: string[] = [];
  const inserted: {code: string; png: Uint8Array}[] = [];
  const pages: PagePorts = {
    here: async () => {
      calls.push('here');
      return failHere ? {ok: false, code: 118, message: 'The handwriting app is not open'} : {ok: true, value: HERE};
    },
    codeOf: async () => {
      calls.push('codeOf');
      return {ok: true, value: code};
    },
    insert: async (_here, puzzle, png) => {
      calls.push('insert');
      inserted.push({code: puzzle, png});
      return {ok: true, value: true};
    },
    ink: async () => {
      calls.push('ink');
      return {ok: true, value: ink};
    },
    read: async () => {
      calls.push('read');
      return {ok: true, text: null};
    },
    log: () => {},
  };
  return {pages, calls, inserted};
}

async function mount(pages: PagePorts) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<GameView game={MAZE} pages={pages} seed={() => SEED} onBack={() => {}} onClose={() => {}} />);
  });
  return tree;
}

/** Presses the control, then lets the view's next frame and its ports' answers run. */
const press = async (tree: ReactTestRenderer, label: string) => {
  const [control] = pressables(tree.root, label);
  expect(control).toBeDefined();
  await act(async () => {
    control.props.onPress();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
};

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

  test('«Add Page» puts the chosen maze on a new page, the same for the same seed', async () => {
    const {pages, inserted} = fakePages();
    const tree = await mount(pages);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining(['Shape', 'Rectangle', 'Circle', 'Difficulty', 'Easy', 'Medium', 'Hard']));
    await press(tree, 'Shape: Circle');
    await press(tree, 'Difficulty: Hard');
    await press(tree, playCopy['new.add']);
    const expected = generateMaze(SEED, mazePageSize('circle', 'hard', 'portrait'), 'hard');
    expect(inserted.map(page => page.code)).toEqual([puzzleCode(expected.id)]);
    expect(shownTexts(tree.root)).toContain(playCopy['added.note']('Maze'));
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
    expect(calls).toEqual(['here', 'codeOf']);
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
  const {pages} = fakePages();
  pages.insert = async () => ({ok: false, code: 802, message: 'Background template file does not exist!'});
  const tree = await mount(pages);
  await press(tree, playCopy['new.add']);
  expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([playCopy['error.add'], playCopy['error.hint']]));
  expect(shownTexts(tree.root)).not.toContain(playCopy['error.hereHint']);
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
