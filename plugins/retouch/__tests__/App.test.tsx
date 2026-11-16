/** Retouch's Settings view keeps the shared size rules and shows one switch per edit (#136). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import App from '../App';
import {EDITS} from '../src/edits';

test('the Settings view keeps the size rules and lists every edit', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  expect(screenBreaks(tree.root)).toEqual([]);
  const headers = tree.root.findAllByProps({accessibilityRole: 'header'});
  expect(headers[0].props.children).toBe('Retouch');
  for (const edit of EDITS) {
    expect(tree.root.findAllByProps({label: edit.name}).length).toBeGreaterThan(0);
  }
});
