/** The Settings view keeps the shared size rules, and each tap changes the setting (#184). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import App from '../App';
import {DEFAULT_SETTINGS, getSettings, setSettings} from '../src/settings';

beforeEach(() => setSettings(DEFAULT_SETTINGS));

test('the Settings view keeps the size rules and has a header', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  expect(screenBreaks(tree.root)).toEqual([]);
  const headers = tree.root.findAllByProps({accessibilityRole: 'header'});
  expect(headers[0].props.children).toBe('Real-Time Conversion');
});

test('a tap on a value saves it for the next time the mode turns on', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  const wide = tree.root.find(
    node =>
      node.props.accessibilityLabel === 'Word spacing: Wide' &&
      typeof node.props.onPress === 'function',
  );
  act(() => wide.props.onPress());
  expect(getSettings().spacing).toBe('wide');
});

test('the start state is one switch, spoken by its name, and a second press turns it back (#274)', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  const toggle = () =>
    tree.root.find(
      node =>
        node.props.accessibilityRole === 'switch' &&
        node.props.accessibilityLabel === 'Start with Real-Time Text on' &&
        typeof node.props.onPress === 'function',
    );
  act(() => toggle().props.onPress());
  expect(getSettings().startOn).toBe(true);
  expect(toggle().props.accessibilityState.checked).toBe(true);
  act(() => toggle().props.onPress());
  expect(getSettings().startOn).toBe(false);
});

test('a press on the value already chosen keeps it and turns no other on', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  const radio = (label: string) =>
    tree.root.find(
      node =>
        node.props.accessibilityRole === 'radio' &&
        node.props.accessibilityLabel === label,
    );
  act(() => radio('Word spacing: Normal').props.onPress());
  expect(getSettings().spacing).toBe('normal');
  const checked = ['Tight', 'Normal', 'Wide'].filter(
    value => radio(`Word spacing: ${value}`).props.accessibilityState.checked,
  );
  expect(checked).toEqual(['Normal']);
});

test('Close and Back close the Settings view (#204, #266)', () => {
  const back = catchBackKey();
  const close = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App close={close} />);
  });
  expect(back.press()).toBe(true);
  const closeButton = tree.root.find(
    node =>
      node.props.accessibilityLabel === 'Close' &&
      typeof node.props.onPress === 'function',
  );
  act(() => closeButton.props.onPress());
  expect(close).toHaveBeenCalledTimes(2);
  back.restore();
});
