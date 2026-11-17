/**
 * «Choose picture»'s screen (#156): the word and its tabs, the status line while it searches, the
 * tiles once listed, a tap on one inserts it, and the other tab runs that mode's own list.
 */
import React from 'react';
import {StyleSheet, ViewStyle} from 'react-native';
import renderer, {
  act,
  ReactTestInstance,
  ReactTestRenderer,
} from 'react-test-renderer';
import type {SearchResult} from '@ink-tools/picture-search';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import {ChooseScreen} from '../src/ui/ChooseScreen';
import * as choose from '../src/choose';
import {pictureCopy} from '../src/copy';

jest.mock('../src/choose', () => ({
  ...jest.requireActual('../src/choose'),
  chooseResults: jest.fn(),
  insertChosen: jest.fn(),
  closeChoose: jest.fn(),
}));

const chooseResults = choose.chooseResults as jest.Mock;
const insertChosen = choose.insertChosen as jest.Mock;
const closeChoose = choose.closeChoose as jest.Mock;
const choice = {word: 'apple', place: null};

function tile(id: string) {
  return {
    result: {id, title: id, source: 'commons'} as SearchResult,
    uri: `file:///${id}.png`,
    contour: false,
  };
}

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ChooseScreen choice={choice} />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(node => typeof node.props.children === 'string')
    .map(node => node.props.children);

beforeEach(() => jest.clearAllMocks());

test('the tiles of the illustration list, then a tap inserts that tile', async () => {
  chooseResults.mockResolvedValue({tiles: [tile('a'), tile('b')], text: null});
  insertChosen.mockResolvedValue({ok: true, value: '/p.png'});
  const tree = await open();
  expect(texts(tree)).toContain('Pictures for «apple»');
  expect(chooseResults.mock.calls[0][0].kind).toBe('illustration');
  const tiles = tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'b, from commons' && node.props.onPress,
  );
  await act(async () => {
    tiles[0].props.onPress();
  });
  expect(insertChosen.mock.calls[0][1].result.id).toBe('b');
});

test('the Photos tab runs the photo list and says when it is empty', async () => {
  chooseResults.mockResolvedValue({
    tiles: [],
    text: pictureCopy.photo['search.empty'],
  });
  const tree = await open();
  const photos = tree.root.find(
    node => node.props.label === 'Photos' && node.props.onPress,
  );
  await act(async () => {
    photos.props.onPress();
  });
  expect(chooseResults.mock.calls[1][0].kind).toBe('photo');
  expect(texts(tree)).toContain('no photo found.');
});

test('a failed insert shows its sentence and keeps the tiles', async () => {
  chooseResults.mockResolvedValue({tiles: [tile('a')], text: null});
  insertChosen.mockResolvedValue({
    ok: false,
    text: 'the picture could not be saved.',
  });
  const tree = await open();
  const [first] = tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'a, from commons' && node.props.onPress,
  );
  await act(async () => {
    first.props.onPress();
  });
  expect(texts(tree)).toContain('the picture could not be saved.');
});

test('Back leaves as «Close» does, and does nothing while an insert runs (#204)', async () => {
  const back = catchBackKey();
  chooseResults.mockResolvedValue({tiles: [tile('a')], text: null});
  let inserted!: (answer: {ok: boolean; text: string}) => void;
  insertChosen.mockReturnValue(
    new Promise(resolve => {
      inserted = resolve;
    }),
  );
  const tree = await open();
  const [first] = tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'a, from commons' && node.props.onPress,
  );
  await act(async () => {
    first.props.onPress();
  });
  expect(back.press()).toBe(true);
  expect(closeChoose).not.toHaveBeenCalled();
  await act(async () => {
    inserted({ok: false, text: 'the picture could not be saved.'});
  });
  expect(back.press()).toBe(true);
  expect(closeChoose).toHaveBeenCalledTimes(1);
  back.restore();
});

describe('the grid leaves «More» and «Close» clear of every tile (#169)', () => {
  const styleOf = (node: {props: {style?: unknown}}) =>
    (StyleSheet.flatten(node.props.style as ViewStyle) ?? {}) as ViewStyle;

  test('three rows share the grid height; a tile has no size of its own to overflow it', async () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(tile);
    chooseResults.mockResolvedValue({tiles: six, text: null});
    const tree = await open();
    const host = (node: ReactTestInstance) => typeof node.type === 'string';
    const grid = tree.root.find(
      node => host(node) && node.props.testID === 'grid',
    );
    expect(styleOf(grid)).toMatchObject({flex: 1});
    const rows = grid.findAll(
      node => host(node) && styleOf(node).flexDirection === 'row',
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(styleOf(row)).toMatchObject({flex: 1, flexDirection: 'row'});
    }
    const tiles = grid.findAll(
      node => host(node) && node.props.accessibilityRole === 'button',
    );
    expect(tiles).toHaveLength(6);
    for (const each of tiles) {
      const style = styleOf(each);
      expect(style.flex).toBe(1);
      expect(style).not.toHaveProperty('aspectRatio');
      expect(style).not.toHaveProperty('width');
      expect(style).not.toHaveProperty('height');
    }
    // The buttons are outside the grid, after it in the screen's column.
    const more = tree.root.findAll(
      node =>
        node.props.label === 'More' || node.props.accessibilityLabel === 'More',
    );
    expect(more.length).toBeGreaterThan(0);
    expect(grid.findAll(node => node.props.label !== undefined)).toEqual([]);
  });
});
