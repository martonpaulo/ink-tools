/** Lookup's Settings view keeps the shared size rules and its switches register the buttons (#93, #115). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PluginManager} from 'sn-plugin-lib';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import App from '../App';
import {DEFINE_BUTTON_ID} from '../src/definition';

test('the Settings view keeps the size rules and has a header', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(tree.root.findAllByProps({accessibilityRole: 'header'})[0].props.children).toBe('Lookup');
});

test('the «Insert definition» switch registers its lasso button', async () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  const toggle = tree.root.find(
    node => node.props.accessibilityLabel === 'Insert definition' || node.props.label === 'Insert definition',
  );
  await act(async () => {
    toggle.props.onPress();
  });
  expect(PluginManager.registerButton).toHaveBeenCalledWith(
    2,
    ['NOTE'],
    expect.objectContaining({id: DEFINE_BUTTON_ID}),
  );
});
