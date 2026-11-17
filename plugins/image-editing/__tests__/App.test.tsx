/** Retouch's Settings view keeps the shared size rules and shows one switch per edit (#136). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import App from '../App';
import {EDITS, STYLES} from '../src/edits';
import * as styles from '../src/styles';
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

describe('Back does what the open screen\'s «Close» does (#204)', () => {
  let back: ReturnType<typeof catchBackKey>;
  beforeEach(() => {
    back = catchBackKey();
  });
  afterEach(() => {
    back.restore();
    jest.restoreAllMocks();
  });

  async function open(close: () => void) {
    await act(async () => {
      renderer.create(<App close={close} />);
    });
  }

  test('on Settings it closes the view', async () => {
    const close = jest.fn();
    await open(close);
    expect(back.press()).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('on the styles grid it closes the grid, never the view alone', async () => {
    jest.spyOn(styles, 'gridState').mockReturnValue({phase: 'failed'});
    const closeStyles = jest
      .spyOn(styles, 'closeStyles')
      .mockResolvedValue(undefined);
    const close = jest.fn();
    await open(close);
    expect(back.press()).toBe(true);
    expect(closeStyles).toHaveBeenCalledWith(close);
    expect(close).not.toHaveBeenCalled();
  });
});

test('Settings wraps its button rows and closes with its own «Close» (#224, #204)', async () => {
  const close = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App close={close} />);
  });
  // screenBreaks fails a row of more than three buttons that does not wrap (#224).
  expect(screenBreaks(tree.root)).toEqual([]);
  const [closeButton] = tree.root.findAllByProps({label: 'Close'});
  await act(async () => {
    closeButton.props.onPress();
  });
  expect(close).toHaveBeenCalledTimes(1);
});
