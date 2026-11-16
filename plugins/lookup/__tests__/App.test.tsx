/**
 * Lookup's Settings view keeps the shared size rules, shows one switch per lasso button, and each
 * switch registers or removes its button and is saved (#93, #111, #115, #142, #167, #174).
 */
import React from 'react';
import {NativeModules} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PluginManager} from 'sn-plugin-lib';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import App from '../App';
import {resetButtonsForTests} from '../src/buttons';
import {DEFINE_BUTTON_ID} from '../src/definition';
import {MODES} from '../src/modes';
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
});

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  return tree;
}

function toggle(tree: ReactTestRenderer, label: string) {
  return tree.root.find(
    node => node.props.label === label && node.props.onPress,
  );
}

test('the Settings view keeps the size rules and has a header', async () => {
  const tree = await open();
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(
    tree.root.findAllByProps({accessibilityRole: 'header'})[0].props.children,
  ).toBe('Word Lookup');
});

test('one switch per lasso button: both picture modes on, the definition off, by default', async () => {
  const tree = await open();
  expect(MODES.map(mode => toggle(tree, mode.name).props.selected)).toEqual([
    true,
    true,
  ]);
  expect(toggle(tree, 'Insert Definition').props.selected).toBe(false);
  expect(toggle(tree, 'Choose Image').props.selected).toBe(true);
});

test('the «Insert Definition» switch registers its lasso button and saves the switch', async () => {
  const tree = await open();
  await act(async () => {
    toggle(tree, 'Insert Definition').props.onPress();
  });
  expect(PluginManager.registerButton).toHaveBeenCalledWith(
    2,
    ['NOTE'],
    expect.objectContaining({id: DEFINE_BUTTON_ID}),
  );
  const [path, text] = files.writeText.mock.calls[0] as unknown as [
    string,
    string,
  ];
  expect(path).toMatch(/\/MyStyle\/Lookup\/settings\.json$/);
  expect(JSON.parse(text)).toMatchObject({
    definition: true,
    illustration: true,
    photo: true,
  });
});

test('both picture switches off: no picture button, and Settings still opens (#111)', async () => {
  files.readText.mockResolvedValue(
    JSON.stringify({
      illustration: false,
      photo: false,
      choose: false,
      directions: {'es-pt': false, 'zh-pt': false, 'pt-zh': false},
    }),
  );
  const tree = await open();
  expect(MODES.map(mode => toggle(tree, mode.name).props.selected)).toEqual([
    false,
    false,
  ]);
  await act(async () => {
    toggle(tree, 'Insert Definition').props.onPress();
  });
  const ids = jest
    .mocked(PluginManager.registerButton)
    .mock.calls.map(call => (call[2] as {id: number}).id);
  expect(ids).toEqual([DEFINE_BUTTON_ID]);
});

test('one switch per translation direction, the owner\'s three on, and a tap saves the direction (#174)', async () => {
  const tree = await open();
  const shown = (name: string) => toggle(tree, name).props.selected;
  expect(
    ['ES→PT', 'PT→ES', 'ZH→PT', 'PT→ZH'].map(d => shown(`Translate ${d}`)),
  ).toEqual([true, false, true, true]);
  await act(async () => {
    toggle(tree, 'Translate PT→ES').props.onPress();
  });
  expect(shown('Translate PT→ES')).toBe(true);
  const [, text] = files.writeText.mock.calls[0] as unknown as [string, string];
  expect(JSON.parse(text).directions).toEqual({
    'es-pt': true,
    'pt-es': true,
    'zh-pt': true,
    'pt-zh': true,
  });
  expect(PluginManager.registerButton).toHaveBeenCalledWith(
    2,
    ['NOTE'],
    expect.objectContaining({name: 'Translate PT→ES'}),
  );
});
