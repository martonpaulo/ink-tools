/** Retouch's Settings view keeps the shared size rules and shows one switch per edit (#136). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import App from '../App';
import {defaultSettings, EDITS, setEdit, STYLES} from '../src/edits';
import * as editor from '../src/editor';
import {EditorState} from '../src/editor';
import {Editor} from '../src/EditorView';

const READY: EditorState = {
  phase: 'ready',
  rect: {left: 100, top: 200, right: 300, bottom: 400},
  preview: '/w/editor-1.png',
  guided: false,
  busy: null,
  draw: null,
  marks: [],
  message: null,
};

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
    source: {
      path: '/s/source.png',
      work: '/s',
      width: 10,
      height: 10,
      pageWidth: 100,
    },
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

describe("Back does what the open screen's «Close» does (#204)", () => {
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
    expect(closeStyles).toHaveBeenCalledWith(expect.any(Function));
    expect(close).not.toHaveBeenCalled();
    // With no editor behind the grid, the grid's own close closes the view.
    closeStyles.mock.calls[0][0]();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('while drawing it cancels the drawing; else it closes the editor, keeping the picture', async () => {
    const state = jest
      .spyOn(editor, 'editorState')
      .mockReturnValue({...READY, draw: 'crop'});
    const cancel = jest
      .spyOn(editor, 'cancelDrawing')
      .mockReturnValue(undefined);
    const closeEditor = jest
      .spyOn(editor, 'closeEditor')
      .mockResolvedValue(undefined);
    const close = jest.fn();
    await act(async () => {
      renderer.create(<App close={close} />);
    });
    expect(back.press()).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    state.mockReturnValue(READY);
    await act(async () => {
      renderer.create(<App close={close} />);
    });
    back.press();
    expect(closeEditor).toHaveBeenCalledWith(close);
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

describe('the editor view (#226)', () => {
  const HANDLERS = [
    'onEdit',
    'onApply',
    'onMark',
    'onClear',
    'onCancel',
    'onClose',
  ] as const;
  const handlers = () =>
    Object.fromEntries(HANDLERS.map(name => [name, jest.fn()])) as Record<
      (typeof HANDLERS)[number],
      jest.Mock
    >;

  async function show(state: EditorState, h = handlers()) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <Editor state={state} settings={defaultSettings} {...h} />,
      );
    });
    return {tree, h};
  }

  function layOut(tree: ReactTestRenderer) {
    const stage = tree.root.findAll(
      node =>
        typeof node.type === 'string' &&
        typeof node.props.onLayout === 'function',
    )[0];
    act(() => {
      stage.props.onLayout({
        nativeEvent: {layout: {x: 0, y: 0, width: 400, height: 400}},
      });
    });
  }

  test('it keeps the size rules and shows every edit as a button, then Close', async () => {
    const {tree, h} = await show(READY);
    layOut(tree);
    expect(screenBreaks(tree.root)).toEqual([]);
    for (const edit of EDITS) {
      expect(
        tree.root.findAllByProps({label: edit.name}).length,
      ).toBeGreaterThan(0);
    }
    await act(async () => {
      tree.root.findAllByProps({label: 'Enhance'})[0].props.onPress();
      tree.root.findAllByProps({label: 'Close'})[0].props.onPress();
    });
    expect(h.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({id: 'enhance'}),
    );
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(
      tree.root.findAllByProps({accessibilityLabel: 'The lassoed picture'})
        .length,
    ).toBeGreaterThan(0);
  });

  test('an edit switched off in Settings has no button', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <Editor
          state={READY}
          settings={setEdit(defaultSettings, 'darker', false)}
          {...handlers()}
        />,
      );
    });
    expect(tree.root.findAllByProps({label: 'Darker'})).toEqual([]);
  });

  test('while drawing, a pen stroke on the picture comes back in page pixels', async () => {
    const {tree, h} = await show({
      ...READY,
      draw: 'erase',
      marks: [[{x: 150, y: 250}]],
    });
    layOut(tree);
    expect(screenBreaks(tree.root)).toEqual([]);
    const canvas = tree.root.findByProps({testID: 'editor-canvas'});
    expect(canvas.props.onStartShouldSetResponder()).toBe(true);
    const at = (x: number, y: number) => ({
      nativeEvent: {locationX: x, locationY: y},
    });
    act(() => {
      canvas.props.onResponderGrant(at(0, 0));
      canvas.props.onResponderMove(at(1, 1));
      canvas.props.onResponderMove(at(40, 60));
      canvas.props.onResponderRelease();
    });
    // 200 x 200 picture in a 400 x 400 stage: two view pixels per page pixel.
    expect(h.onMark).toHaveBeenCalledWith([
      {x: 100, y: 200},
      {x: 120, y: 230},
    ]);
    await act(async () => {
      tree.root.findAllByProps({label: 'Erase'})[0].props.onPress();
      tree.root.findAllByProps({label: 'Clear marks'})[0].props.onPress();
      tree.root.findAllByProps({label: 'Cancel'})[0].props.onPress();
    });
    expect(h.onApply).toHaveBeenCalledWith(
      expect.objectContaining({id: 'erase'}),
    );
    expect(h.onClear).toHaveBeenCalledTimes(1);
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });

  test('the canvas takes no pen outside a drawing, and a failure says why', async () => {
    const {tree} = await show(READY);
    layOut(tree);
    expect(
      tree.root
        .findByProps({testID: 'editor-canvas'})
        .props.onStartShouldSetResponder(),
    ).toBe(false);
    const failed = await show({
      phase: 'failed',
      message: 'Lasso one picture only, then press again.',
    });
    expect(
      failed.tree.root.findAllByProps({
        children: 'Lasso one picture only, then press again.',
      }).length,
    ).toBeGreaterThan(0);
  });
});
