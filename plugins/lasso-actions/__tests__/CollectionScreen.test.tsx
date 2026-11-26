/**
 * The collection's view (#249): «Paste Collection» opens it on the count, Paste, Clear and Keep
 * After Paste; it keeps the shared size rules, Clear empties the collection, and the switch is saved.
 */
import React from 'react';
import {NativeModules} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {ok} from '@ink-tools/sn-adapter/official';
import App from '../App';
import type {CollectionHost} from '../src/collection/run';
import {
  closeCollection,
  collectionOpen,
  openCollection,
} from '../src/collection/view';
import {CollectionScreen} from '../src/ui/CollectionScreen';
import {resetButtonsForTests} from '../src/buttons';
import {resetSettingsForTests} from '../src/profile';

const files = {
  readText: jest.fn(),
  writeText: jest.fn(async () => null),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  files.readText.mockResolvedValue(null);
  NativeModules.LookupFiles = files;
  resetSettingsForTests();
  resetButtonsForTests();
  closeCollection();
});

function folderHost(names: string[]): CollectionHost & {names: string[]} {
  const host = {
    names,
    folder: async () => ok('/plugin'),
    list: async () => ok(host.names.length > 0 ? [...host.names] : null),
    remove: async (path: string) => {
      host.names = host.names.filter(name => !path.endsWith(`/${name}`));
      return ok(true);
    },
    lassoRect: async () => ok({left: 0, top: 0, right: 1, bottom: 1}),
    pageSize: async () => ok({width: 1404, height: 1872}),
    saveSticker: async () => ok(true),
    deleteLasso: async () => ok(true),
    insertSticker: async () => ok(true),
    resize: async () => ok(true),
    select: async () => ok(true),
    closeView: async () => ok(true),
    wait: async () => {},
    ask: async () => ok(true),
    toast: () => {},
    log: () => {},
  };
  return host;
}

const control = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];

const text = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(node => typeof node.props.children === 'string')
    .map(node => node.props.children as string);

async function show(host: CollectionHost, close = jest.fn()) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<CollectionScreen close={close} host={host} />);
  });
  return tree;
}

test('Paste Collection opens the view on the collection, not on Settings', async () => {
  openCollection();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App close={() => {}} />);
  });
  expect(
    tree.root.findAllByProps({accessibilityRole: 'header'})[0].props.children,
  ).toBe('Collection');
});

test('the view shows the count and keeps the size rules', async () => {
  const tree = await show(
    folderHost([
      'collection-1_0_0_5_5.sticker',
      'collection-2_0_0_5_5.sticker',
      'settings.json',
    ]),
  );
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(text(tree)).toContain('2 pieces in the collection.');
});

test('an empty collection disables Paste and Clear', async () => {
  const tree = await show(folderHost([]));
  expect(text(tree)).toContain('The collection is empty.');
  for (const label of ['Paste Collection', 'Clear Collection']) {
    expect(control(tree, label).props.accessibilityState?.disabled).toBe(true);
  }
});

test('Clear Collection empties it and shows the new count', async () => {
  const host = folderHost(['collection-1_0_0_5_5.sticker']);
  const tree = await show(host);
  await act(async () => {
    await control(tree, 'Clear Collection').props.onPress();
  });
  expect(host.names).toEqual([]);
  expect(text(tree)).toContain('The collection is empty.');
});

test('Keep After Paste starts off and is saved with the settings', async () => {
  const tree = await show(folderHost([]));
  const keep = control(tree, 'Keep After Paste');
  expect(keep.props.accessibilityState?.checked).toBe(false);
  await act(async () => {
    keep.props.onPress();
  });
  const writes = files.writeText.mock.calls as unknown as [string, string][];
  expect(JSON.parse(writes[writes.length - 1][1]).collection).toEqual({
    keepAfterPaste: true,
  });
});

test('the title bar × leaves the collection and closes the view', async () => {
  openCollection();
  const close = jest.fn();
  const tree = await show(folderHost([]), close);
  await act(async () => {
    control(tree, 'Close').props.onPress();
  });
  expect(close).toHaveBeenCalled();
  expect(collectionOpen()).toBe(false);
});
