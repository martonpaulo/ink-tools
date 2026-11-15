/** Relay's Settings view keeps the shared size rules and marks its title as a header (#93). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import App from '../App';

test('the Settings view keeps the size rules and has a header', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(
    tree.root.findByProps({accessibilityRole: 'header'}).props.children,
  ).toBe('Relay');
});
