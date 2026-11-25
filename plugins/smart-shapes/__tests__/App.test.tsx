/** The Settings view keeps the shared size rules, and each tap changes the setting (#253). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import App from '../App';
import {
  DEFAULT_SETTINGS,
  getSettings,
  MIN_SIZE_CHOICES_MM,
  minSizePx,
  setSettings,
} from '../src/settings';

beforeEach(() => setSettings(DEFAULT_SETTINGS));

const mount = (close = () => {}) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App close={close} />);
  });
  return tree;
};
const tap = (tree: ReactTestRenderer, label: string) => {
  const button = tree.root.find(
    node =>
      (node.props.accessibilityLabel ?? node.props.label) === label &&
      typeof node.props.onPress === 'function',
  );
  act(() => button.props.onPress());
};

test('the Settings view keeps the size rules and has a header', () => {
  const tree = mount();
  expect(screenBreaks(tree.root)).toEqual([]);
  const headers = tree.root.findAllByProps({accessibilityRole: 'header'});
  expect(headers[0].props.children).toBe('Smart Shapes');
});

test('a tap on a size sets the smallest figure the next held stroke may become', () => {
  const tree = mount();
  tap(tree, 'Smallest shape: 24 mm');
  expect(getSettings().minSizeMm).toBe(24);
  expect(minSizePx(getSettings())).toBeCloseTo(283.5, 1);
});

test('the switch and each shape turn on and off', () => {
  const tree = mount();
  tap(tree, 'Held strokes become shapes');
  tap(tree, 'Arrow');
  expect(getSettings().on).toBe(false);
  expect(getSettings().shapes).toEqual({
    ...DEFAULT_SETTINGS.shapes,
    arrow: false,
  });
  tap(tree, 'Arrow');
  expect(getSettings().shapes.arrow).toBe(true);
});

test('each setting is a kit switch or radio, never a button with selected (#274)', () => {
  const tree = mount();
  const roles = (role: string) =>
    tree.root.findAll(
      node =>
        typeof node.type === 'string' && node.props.accessibilityRole === role,
    );
  // The switch and the five shapes; one radio per size, the default one checked.
  expect(roles('switch')).toHaveLength(6);
  const radios = roles('radio');
  expect(radios).toHaveLength(MIN_SIZE_CHOICES_MM.length);
  expect(
    radios.filter(radio => radio.props.accessibilityState.checked),
  ).toHaveLength(1);
});

test('Close and Back close the Settings view (#204, #255)', () => {
  const back = catchBackKey();
  const close = jest.fn();
  const tree = mount(close);
  expect(back.press()).toBe(true);
  tap(tree, 'Close');
  expect(close).toHaveBeenCalledTimes(2);
  back.restore();
});
