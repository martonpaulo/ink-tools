/**
 * The shared game view's test kit (#386, #397, #402): fake pages that record every call, a mount of
 * one game's view, and a press that lets the view's next frame and its ports' answers run. Each
 * game's test in `__tests__/` uses it.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {cellCenter, encodePng, PAGE_LAYOUT, placedPageCode, type Grid, type InkStroke, type PageLayoutVersion, type ReadText} from '@ink-tools/puzzle-core';
import {THROWN_CODE} from '@ink-tools/sn-adapter/official';
import {GameView} from '../src/play/GameView';
import type {Here, PagePorts} from '../src/play/pages';
import type {KeptChoices} from '../src/play/kept';
import type {Choices, PuzzleGame} from '../src/play/puzzle';
import {playCopy} from '../src/play/copy';

export const SEED = '7K2Q9X';
export const HERE: Here = {notePath: '/storage/emulated/0/Note/Puzzles.note', page: 2, size: {width: 1920, height: 2560}, orientation: 'portrait'};

type FakeOptions = {
  /** The puzzle code the current page holds; its background's name adds the page layout. */
  code?: string | null;
  /** The layout the page was drawn by: the current one, or 1 for a page with no mark in its name (#553). */
  layout?: PageLayoutVersion;
  ink?: InkStroke<object>[];
  /** The tablet's reading of some strokes; by default it reads nothing. */
  read?: (elements: object[]) => ReadText;
  failHere?: boolean;
};

/**
 * Fake pages: every call is recorded, and every inserted page kept, with the page it went after.
 * `turn` moves to another page, as the page bar does while the view stays mounted (#542).
 */
export function fakePages({code = null, layout = PAGE_LAYOUT, ink = [], read = () => ({ok: true, text: null}), failHere = false}: FakeOptions = {}) {
  const calls: string[] = [];
  /** What the view wrote to the plugin's log. */
  const lines: string[] = [];
  const inserted: {code: string; png: Uint8Array; after: number}[] = [];
  /** A page's background name: a page of layout 1 has the bare code. */
  const named = (puzzle: string | null) => (puzzle === null || layout === 1 ? puzzle : placedPageCode(puzzle, layout));
  const on = {here: HERE, code: named(code), failHere};
  const turn = (page: number, pageCode: string | null = null) => {
    Object.assign(on, {here: {...HERE, page}, code: named(pageCode)});
  };
  const pages: PagePorts = {
    here: async () => {
      calls.push('here');
      return on.failHere ? {ok: false, code: THROWN_CODE, message: 'The handwriting app is not open'} : {ok: true, value: on.here};
    },
    codeOf: async () => {
      calls.push('codeOf');
      return {ok: true, value: on.code};
    },
    insert: async (here, puzzle, png) => {
      calls.push('insert');
      inserted.push({code: puzzle, png, after: here.page});
      return {ok: true, value: true};
    },
    ink: async () => {
      calls.push('ink');
      return {ok: true, value: ink};
    },
    read: async (_here, elements) => {
      calls.push('read');
      return read(elements);
    },
    clear: async () => {
      calls.push('clear');
      return {ok: true, value: 0};
    },
    hide: async () => calls.push('hide'),
    show: async () => calls.push('show'),
    log: line => {
      lines.push(line);
    },
  };
  /** Makes the next page reads fail, or answer again. */
  const failReads = (fail: boolean) => {
    on.failHere = fail;
  };
  return {pages, calls, lines, inserted, turn, failReads};
}

/** Kept choices in memory (#569): `file` is what the device keeps, shared by every view given it. */
export function fakeKept(file: Record<string, Choices> = {}): KeptChoices & {file: Record<string, Choices>} {
  return {
    file,
    recall: async game => ({ok: true, value: file[game] ?? null}),
    keep: async (game, choices) => {
      file[game] = choices;
      return {ok: true, value: true};
    },
  };
}

/** One game's view on these pages, with a fixed seed and, unless given, no kept choices. */
export async function mount(game: PuzzleGame, pages: PagePorts, onBack = () => {}, kept: KeptChoices = fakeKept()) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<GameView game={game} pages={pages} seed={() => SEED} kept={kept} onBack={onBack} onClose={() => {}} />);
  });
  return tree;
}

/** Presses the control, then lets the view's next frame and its ports' answers run. */
export async function press(tree: ReactTestRenderer, label: string) {
  const [control] = pressables(tree.root, label);
  expect(control).toBeDefined();
  await act(async () => {
    control.props.onPress();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** A written stroke reaches this share of the cell above and below its centre. */
const STROKE_REACH = 0.25;

/**
 * A cell game's page written by hand (#390, #383): a stroke in each of `cells`, tagged with what
 * `change` makes of its right value; `readDigits` reads the tags back, and an `x` as unreadable.
 */
export function writtenCells(
  grid: Grid,
  cells: Iterable<readonly [number, string]>,
  change: (cell: number, value: string) => string = (_cell, value) => value,
): InkStroke<object>[] {
  return [...cells].map(([cell, value]) => {
    const [x, y] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    const reach = grid.cell * STROKE_REACH;
    return {points: [{x, y: y - reach}, {x, y: y + reach}], element: {digit: change(cell, value)}};
  });
}
export const readDigits = (elements: object[]): ReadText => {
  const digits = elements.map(element => (element as {digit: string}).digit);
  return digits.includes('x') ? {ok: true, text: null} : {ok: true, text: digits.join(' ')};
};

/** «Check» on a page holding `code` and `ink` says it is solved. */
export async function expectSolved(game: PuzzleGame, code: string, ink: InkStroke<object>[]) {
  const right = fakePages({code, ink, read: readDigits});
  const tree = await mount(game, right.pages);
  await press(tree, playCopy['here.check']);
  expect(shownTexts(tree.root)).toContain(playCopy['verdict.solved']);
}

/**
 * Presses «Add Page» and expects one new page, `code`, drawn as `game` draws it from `choices`
 * and the fixed seed; the view closes before the insert, as its note reload can end the view.
 */
export async function expectAdded(tree: ReactTestRenderer, fake: ReturnType<typeof fakePages>, game: PuzzleGame, code: string, choices: Choices) {
  await press(tree, playCopy['new.add']);
  expect(fake.inserted.map(page => page.code)).toEqual([placedPageCode(code)]);
  expect(fake.calls).toEqual(['clear', 'here', 'codeOf', 'here', 'hide', 'insert']);
  const again = game.create(choices, SEED, {orientation: HERE.orientation, hand: 'right'});
  expect(Buffer.from(fake.inserted[0].png).equals(Buffer.from(encodePng(again.page)))).toBe(true);
}
