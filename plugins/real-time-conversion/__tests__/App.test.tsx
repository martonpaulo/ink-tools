/** The Settings view keeps the shared size rules, and each tap changes the setting (#184). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
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
    node => node.props.accessibilityLabel === 'Word spacing: Wide' && typeof node.props.onPress === 'function',
  );
  act(() => wide.props.onPress());
  expect(getSettings().spacing).toBe('wide');
});
