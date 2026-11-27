/**
 * The shared game view's test kit (#386, #397, #402): fake pages that record every call, a mount of
 * one game's view, and a press that lets the view's next frame and its ports' answers run. Each
 * game's test in `__tests__/` uses it.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {pressables} from '@ink-tools/ui-kit/problemTest';
import type {InkStroke, ReadText} from '@ink-tools/puzzle-core';
import {THROWN_CODE} from '@ink-tools/sn-adapter/official';
import {GameView} from '../src/play/GameView';
import type {Here, PagePorts} from '../src/play/pages';
import type {PuzzleGame} from '../src/play/puzzle';

export const SEED = '7K2Q9X';
export const HERE: Here = {notePath: '/storage/emulated/0/Note/Puzzles.note', page: 2, size: {width: 1920, height: 2560}, orientation: 'portrait'};

type FakeOptions = {
  /** The puzzle the current page holds, by its background's name. */
  code?: string | null;
  ink?: InkStroke<object>[];
  /** The tablet's reading of some strokes; by default it reads nothing. */
  read?: (elements: object[]) => ReadText;
  failHere?: boolean;
};

/** Fake pages: every call is recorded, and every inserted page kept. */
export function fakePages({code = null, ink = [], read = () => ({ok: true, text: null}), failHere = false}: FakeOptions = {}) {
  const calls: string[] = [];
  const inserted: {code: string; png: Uint8Array}[] = [];
  const pages: PagePorts = {
    here: async () => {
      calls.push('here');
      return failHere ? {ok: false, code: THROWN_CODE, message: 'The handwriting app is not open'} : {ok: true, value: HERE};
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
    log: () => {},
  };
  return {pages, calls, inserted};
}

/** One game's view on these pages, with a fixed seed. */
export async function mount(game: PuzzleGame, pages: PagePorts, onBack = () => {}) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<GameView game={game} pages={pages} seed={() => SEED} onBack={onBack} onClose={() => {}} />);
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
