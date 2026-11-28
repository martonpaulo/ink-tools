/**
 * The Puzzles view opens on the page's puzzle (#601): a page a puzzle game made, of any page
 * layout it knows, opens straight on that game's «Check» and «Show Solution», in portrait and in
 * landscape, with no puzzle made yet; a blank page, a page of other ink, a board's page, a page a
 * newer Puzzles drew and a page that cannot be read open on the game list.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {pageCodeParts, parsePuzzleCode, placedPageCode, type PageLayoutVersion} from '@ink-tools/puzzle-core';
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {BACK_LABEL} from '@ink-tools/ui-kit/controlsCopy';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import {buttonId} from '@ink-tools/ui-kit';
import {PluginManager} from 'sn-plugin-lib';
import {startButtonQueue} from '@ink-tools/sn-adapter/official';
import App from '../App';
import {copy} from '../src/copy';
import {PUZZLE_GAMES} from '../src/games';
import {BOARDS} from '../src/games/boards';
import {gameOfPage} from '../src/PuzzlesView';
import {codeOfTemplate, type Here, type PagePorts} from '../src/play/pages';
import {puzzleEntry} from '../src/play/GameView';
import {playCopy} from '../src/play/copy';
import {settle, type PuzzleGame} from '../src/play/puzzle';
import type {RequirementPorts} from '../src/requirements';
import {onToolbarPress, PUZZLES_ID} from '../src/toolbar';
import {fakeKept, fakePages, HERE, mount as mountGame, SEED} from '../testing/gameView';

const PUZZLES = PUZZLE_GAMES.filter(game => game.open);
const LANDSCAPE: Here = {...HERE, size: {width: HERE.size.height, height: HERE.size.width}, orientation: 'landscape'};

/** Every permission granted, so a game's view opens once its requirements are checked. */
const granted = (): RequirementPorts => ({has: async () => ({ok: true, value: true}), request: async () => ({ok: true, value: 1}), log: () => {}});

/** A page `game` made with its first choices: its code, without the page layout. */
const codes = new Map<string, string>();
const codeOf = (game: PuzzleGame) => {
  if (!codes.has(game.id)) {
    codes.set(game.id, game.create(settle(game.options, {}), SEED, {orientation: 'portrait', hand: 'right'}).code);
  }
  return codes.get(game.id) as string;
};

/** The Puzzles view on `pages`, its every game's view on the same pages, as the device runs it. */
async function open(pages: PagePorts, ports: RequirementPorts = granted()) {
  const games = PUZZLE_GAMES.map(game => puzzleEntry(game, {pages, kept: fakeKept(), seed: () => SEED}));
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App close={() => {}} ports={ports} games={games} pages={pages} />);
  });
  return tree;
}

/** The screen shows `game`'s «This page» with its two actions, and no game list. */
function expectOnPuzzle(tree: ReactTestRenderer, game: PuzzleGame, name: string) {
  const texts = shownTexts(tree.root);
  const band = playCopy.bands[parsePuzzleCode(pageCodeParts(name).code).difficulty];
  expect(texts).toContain(game.title);
  // The game's name, its size where it has one, and its difficulty, over the page's code.
  expect(texts.some(text => String(text).startsWith(`${game.title}, `) && String(text).endsWith(band))).toBe(true);
  expect(texts).toContain(pageCodeParts(name).code);
  expect(pressables(tree.root, playCopy['here.check'])).not.toHaveLength(0);
  expect(pressables(tree.root, playCopy['here.answer'])).not.toHaveLength(0);
  expect(texts).not.toContain(copy['games.caption']);
}

/** The host views with `testID`: one per screen shown. */
const withId = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID);
/** The buttons of `kind` shown, by the `nativeID` the render rules read too. */
const buttonsOf = (tree: ReactTestRenderer, kind: Parameters<typeof buttonId>[0]) =>
  tree.root.findAll(node => typeof node.type === 'string' && node.props.nativeID === buttonId(kind));

const expectList = (tree: ReactTestRenderer) => {
  expect(shownTexts(tree.root)).toContain(copy['games.caption']);
  expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
};

describe.each([
  ['portrait', HERE],
  ['landscape', LANDSCAPE],
] as const)('a page a puzzle made opens on its Check and Show Solution, %s (#601)', (_orientation, here) => {
  test.each(PUZZLES.map(game => [game.id, game] as const))('%s', async (_id, game) => {
    const fake = fakePages({code: codeOf(game)});
    const pages = {...fake.pages, here: async () => ({ok: true as const, value: here})};
    const made = jest.spyOn(game, 'open');
    try {
      const tree = await open(pages);
      expectOnPuzzle(tree, game, placedPageCode(codeOf(game)));
      // Only the code was read: the puzzle is made once a press needs it, so the view opens at once (#595).
      expect(made).not.toHaveBeenCalled();
    } finally {
      made.mockRestore();
    }
  });
});

describe.each([1, 2] as const)('a page of the older layout %i opens on its puzzle (#601)', layout => {
  test.each(PUZZLES.map(game => [game.id, game] as const))('%s', async (_id, game) => {
    const tree = await open(fakePages({code: codeOf(game), layout: layout as PageLayoutVersion}).pages);
    expectOnPuzzle(tree, game, layout === 1 ? codeOf(game) : placedPageCode(codeOf(game), layout));
  });
});

describe('a page with no puzzle of the list opens on the game list (#601)', () => {
  test('a blank page or one of other ink, whose background is no Puzzles page', async () => {
    const fake = fakePages({code: null});
    const tree = await open(fake.pages);
    expectList(tree);
    expect(fake.lines).toContain('opened on page 2: no puzzle of the list');
  });

  test('a page of the person\'s own background, whose name is no puzzle code', async () => {
    expect(codeOfTemplate('user_my-lines.png')).toBe('my-lines');
    const fake = fakePages({code: 'my-lines', layout: 1});
    expectList(await open(fake.pages));
  });

  test('a pass-and-play board\'s page, which holds nothing to check', async () => {
    const [board] = BOARDS;
    const {code} = board.create(settle(board.options, {}), SEED, {orientation: 'portrait', hand: 'right'});
    expectList(await open(fakePages({code}).pages));
  });

  test('a page a newer Puzzles drew', async () => {
    const [game] = PUZZLES;
    expectList(await open(fakePages({code: `${codeOf(game)}-L9`, layout: 1}).pages));
  });

  test('a page that cannot be read shows the list, never an Error, and logs why', async () => {
    const fake = fakePages({code: codeOf(PUZZLES[0]), failHere: true});
    const tree = await open(fake.pages);
    expectList(tree);
    expect(fake.lines.some(line => line.startsWith('the page was not read'))).toBe(true);
  });

  test('a puzzle code of a game the list lacks', () => {
    const games = PUZZLE_GAMES.slice(1).map(game => puzzleEntry(game));
    expect(gameOfPage(placedPageCode(codeOf(PUZZLE_GAMES[0])), games)).toBeNull();
    expect(gameOfPage(placedPageCode(codeOf(PUZZLE_GAMES[1])), games)?.id).toBe(PUZZLE_GAMES[1].id);
  });
});

test('the opened game still checks what it needs first, and ‹ goes to the game list for a new puzzle', async () => {
  const [game] = PUZZLES;
  const ports = granted();
  const has = jest.spyOn(ports, 'has');
  const tree = await open(fakePages({code: codeOf(game)}).pages, ports);
  expect(has).toHaveBeenCalled();
  expectOnPuzzle(tree, game, placedPageCode(codeOf(game)));
  await act(async () => pressables(tree.root, BACK_LABEL)[0].props.onPress());
  expectList(tree);
});

test('under the page\'s puzzle, «Other Games» goes to the game list, and the Back key does too (#601)', async () => {
  const [game] = PUZZLES;
  const tree = await open(fakePages({code: codeOf(game)}).pages);
  await act(async () => pressables(tree.root, playCopy['here.others'])[0].props.onPress());
  expectList(tree);
  const back = catchBackKey();
  try {
    const again = await open(fakePages({code: codeOf(game)}).pages);
    await act(async () => {
      back.press();
    });
    expectList(again);
  } finally {
    back.restore();
  }
});

test('on a page of the game, «Check» is the main action and «Add Page» is not filled; with none, «Add Page» is (#601)', async () => {
  const [game] = PUZZLES;
  const onPage = await open(fakePages({code: codeOf(game)}).pages);
  expect(buttonsOf(onPage, 'primary')).toHaveLength(0);
  expect(buttonsOf(onPage, 'secondary')).toHaveLength(1);
  expect(pressables(onPage.root, playCopy['new.add'])).not.toHaveLength(0);
  const blank = await mountGame(game, fakePages({code: null}).pages);
  expect(buttonsOf(blank, 'primary')).toHaveLength(1);
});

test('a game opened from the list shows no «Other Games» row, as ‹ is the way back it came by', async () => {
  const [game] = PUZZLES;
  const tree = await mountGame(game, fakePages({code: codeOf(game)}).pages);
  expect(pressables(tree.root, playCopy['here.check'])).not.toHaveLength(0);
  expect(pressables(tree.root, playCopy['here.others'])).toHaveLength(0);
});

test('the page is read once as the view opens, with no Loading mark, and the game view starts from that read (#601)', async () => {
  const [game] = PUZZLES;
  const fake = fakePages({code: codeOf(game)});
  const tree = await open(fake.pages);
  expectOnPuzzle(tree, game, placedPageCode(codeOf(game)));
  expect(fake.calls.filter(call => call === 'here' || call === 'codeOf')).toEqual(['here', 'codeOf']);
  // A page read the host has not answered yet: the title bar alone, with Close.
  const slow = fakePages({code: codeOf(game)});
  const waiting = await open({...slow.pages, here: () => new Promise(() => {})});
  expect(withId(waiting, 'loading-view')).toHaveLength(0);
  expect(shownTexts(waiting.root)).toContain(copy.title);
  expect(pressables(waiting.root)).not.toHaveLength(0);
});

test('each press of the button reads the page again: a puzzle page opens on it, a blank one on the list (#601)', async () => {
  const show = jest.fn();
  startButtonQueue(id => onToolbarPress(id, show));
  const listener = (PluginManager.registerButtonListener as jest.Mock).mock.calls.at(-1)[0];
  const [first, second] = PUZZLES;
  const fake = fakePages({code: null});
  const tree = await open(fake.pages);
  expectList(tree);
  fake.turn(5, codeOf(second));
  await act(async () => listener.onButtonPress({id: PUZZLES_ID}));
  expectOnPuzzle(tree, second, placedPageCode(codeOf(second)));
  fake.turn(6, codeOf(first));
  await act(async () => listener.onButtonPress({id: PUZZLES_ID}));
  expectOnPuzzle(tree, first, placedPageCode(codeOf(first)));
  fake.turn(7);
  await act(async () => listener.onButtonPress({id: PUZZLES_ID}));
  expectList(tree);
});
