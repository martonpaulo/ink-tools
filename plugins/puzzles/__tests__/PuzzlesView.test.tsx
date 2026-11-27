/** The Puzzles view's states (#453): the game list, and Loading, Needs and Error when a game opens. */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey, fakeBackKeyModule} from '@ink-tools/ui-kit/backKeyTest';
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {RETRY_TEXT} from '@ink-tools/ui-kit';
import App from '../App';
import {copy} from '../src/copy';
import type {Game} from '../src/games';
import type {RequirementPorts} from '../src/requirements';

const READ = 'plugin.permission.FILE:READ';
const WRITE = 'plugin.permission.FILE:WRITE';
const GAME_LABEL = 'Test game, A synthetic game';

/** Ports whose host grants what `granted` holds; `request` grants unless `refuse` is set. */
function fakePorts(granted: Set<string>, {failing = false, refuse = false} = {}) {
  const ports: RequirementPorts & {asked: string[]} = {
    asked: [],
    has: async permission =>
      failing
        ? {ok: false, code: 118, message: 'The handwriting app is not open'}
        : {ok: true, value: granted.has(permission)},
    request: async permission => {
      ports.asked.push(permission);
      if (refuse) {
        return {ok: true, value: 0};
      }
      granted.add(permission);
      return {ok: true, value: 1};
    },
    log: () => {},
  };
  return ports;
}

const game = (requires: Game['requires'] = undefined): Game => ({
  id: 'test-game',
  title: 'Test game',
  subtitle: 'A synthetic game',
  requires,
  View: ({onBack}) => <Text onPress={onBack}>Playing</Text>,
});

/** The host views with `testID`: one per screen shown, never the components around them. */
const state = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID);

async function mount(props: React.ComponentProps<typeof App>) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App {...props} />);
  });
  return tree;
}

const press = (tree: ReactTestRenderer, label: string) =>
  act(async () => pressables(tree.root, label)[0].props.onPress());

test('with no game, the view says so, asks for nothing and closes', async () => {
  const ports = fakePorts(new Set());
  const tree = await mount({ports, games: []});
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(tree.root.findAllByProps({accessibilityRole: 'header'})[0].props.children).toBe('Puzzles');
  expect(shownTexts(tree.root)).toContain(copy['games.none']);
  expect(ports.asked).toEqual([]);
  expect(pressables(tree.root)).not.toHaveLength(0);
});

test('opening a game with a permission not granted shows Needs naming it, and Allow opens the game', async () => {
  const ports = fakePorts(new Set([READ]));
  const tree = await mount({ports, games: [game()]});
  await press(tree, GAME_LABEL);
  expect(state(tree, 'needs')).toHaveLength(1);
  expect(shownTexts(tree.root)).toContain('Puzzles needs File write');
  await press(tree, copy['needs.allow']);
  expect(ports.asked).toEqual([WRITE]);
  expect(shownTexts(tree.root)).toContain('Playing');
});

test('a refused Allow shows the steps in Settings, never the same Needs again', async () => {
  const ports = fakePorts(new Set(), {refuse: true});
  const tree = await mount({ports, games: [game()]});
  await press(tree, GAME_LABEL);
  expect(shownTexts(tree.root)).toContain('Puzzles needs File read and File write');
  await press(tree, copy['needs.allow']);
  expect(state(tree, 'problem-steps')).toHaveLength(1);
  expect(shownTexts(tree.root)).toContain('2. Allow File read and File write.');
  expect(pressables(tree.root, copy['needs.allow'])).toHaveLength(0);
});

test('a check the host cannot answer shows Error with Retry, and Retry checks again', async () => {
  const granted = new Set([READ, WRITE]);
  const ports = fakePorts(granted, {failing: true});
  const tree = await mount({ports, games: [game()]});
  await press(tree, GAME_LABEL);
  expect(state(tree, 'error-view')).toHaveLength(1);
  expect(shownTexts(tree.root)).toContain(copy['error.checkHint']);
  expect(pressables(tree.root)).not.toHaveLength(0);
  ports.has = async permission => ({ok: true, value: granted.has(permission)});
  await press(tree, RETRY_TEXT);
  expect(shownTexts(tree.root)).toContain('Playing');
});

test('while the check runs, the view shows Loading with Close', async () => {
  const ports = fakePorts(new Set());
  ports.has = () => new Promise(() => {});
  const tree = await mount({ports, games: [game()]});
  await press(tree, GAME_LABEL);
  expect(state(tree, 'loading-view')).toHaveLength(1);
  expect(pressables(tree.root)).not.toHaveLength(0);
});

test("a game's own requirement is checked with the plugin's before its view opens", async () => {
  const ports = fakePorts(new Set([READ, WRITE]));
  const extra = 'plugin.permission.INTERNET';
  const tree = await mount({ports, games: [game([{kind: 'permission', permission: extra}])]});
  await press(tree, GAME_LABEL);
  expect(state(tree, 'needs')).toHaveLength(1);
  await press(tree, copy['needs.allow']);
  expect(ports.asked).toEqual([extra]);
  expect(shownTexts(tree.root)).toContain('Playing');
});

test("a game's Back returns to the list without checking again", async () => {
  const ports = fakePorts(new Set([READ, WRITE]));
  const has = jest.spyOn(ports, 'has');
  const tree = await mount({ports, games: [game()]});
  await press(tree, GAME_LABEL);
  const checks = has.mock.calls.length;
  await act(async () => tree.root.findByType(Text).props.onPress());
  expect(shownTexts(tree.root)).toContain('Test game');
  expect(has.mock.calls.length).toBe(checks);
});

test('Close and Back both close the view, and Back is armed on the native module', async () => {
  const back = catchBackKey();
  const module = fakeBackKeyModule('PuzzlesBack');
  const close = jest.fn();
  const tree = await mount({close, ports: fakePorts(new Set()), games: []});
  expect(back.press()).toBe(true);
  act(() => pressables(tree.root)[0].props.onPress());
  expect(close).toHaveBeenCalledTimes(2);
  expect(module.listen).toHaveBeenCalledTimes(1);
  module.restore();
  back.restore();
});
