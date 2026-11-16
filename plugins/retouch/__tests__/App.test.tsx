/** Retouch's Settings view keeps the shared size rules and shows one switch per edit (#136). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import App from '../App';
import {EDITS, STYLES} from '../src/edits';
import {GridState} from '../src/styles';
import {StylesGrid} from '../src/StylesGrid';

test('the Settings view keeps the size rules and lists every edit', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  expect(screenBreaks(tree.root)).toEqual([]);
  const headers = tree.root.findAllByProps({accessibilityRole: 'header'});
  expect(headers[0].props.children).toBe('Image Editing');
  for (const edit of EDITS) {
    expect(tree.root.findAllByProps({label: edit.name}).length).toBeGreaterThan(
      0,
    );
  }
});

test('Settings lists a switch per style (#133)', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  for (const style of STYLES) {
    expect(
      tree.root.findAllByProps({label: style.name}).length,
    ).toBeGreaterThan(0);
  }
});

test('the Styles grid keeps the size rules, labels each tile and says when it failed (#133)', async () => {
  const onPick = jest.fn();
  const onToggle = jest.fn();
  const ready: GridState = {
    phase: 'ready',
    tiles: [
      {style: 'dither', path: '/s/dither.png'},
      {style: 'photo', path: '/s/photo.png'},
      {style: 'line_art', path: '/s/line.png'},
    ],
    options: {transparent: true, thick: false},
    source: {path: '/s/source.png', work: '/s', width: 10, height: 10, pageWidth: 100},
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <StylesGrid
        state={ready}
        onPick={onPick}
        onToggle={onToggle}
        onClose={() => {}}
      />,
    );
  });
  expect(screenBreaks(tree.root)).toEqual([]);
  await act(async () => {
    tree.root.findByProps({testID: 'style-dither'}).props.onPress();
    tree.root.findByProps({label: 'Thicker lines'}).props.onPress();
  });
  expect(onPick).toHaveBeenCalledWith('dither');
  expect(onToggle).toHaveBeenCalledWith('thick');
  expect(
    tree.root.findByProps({label: 'White to transparent'}).props.selected,
  ).toBe(true);
  let failed!: ReactTestRenderer;
  await act(async () => {
    failed = renderer.create(
      <StylesGrid
        state={{phase: 'failed'}}
        onPick={onPick}
        onToggle={onToggle}
        onClose={() => {}}
      />,
    );
  });
  expect(
    failed.root.findAllByProps({children: 'Could not make the styles'}).length,
  ).toBeGreaterThan(0);
});
