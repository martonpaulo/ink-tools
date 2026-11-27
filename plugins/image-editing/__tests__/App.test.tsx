/** Retouch's Settings view keeps the shared size rules and shows one switch per edit (#136). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {Image, RootTagContext, ScrollView, StyleSheet} from 'react-native';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {TitleBar} from '@ink-tools/ui-kit';
import {catchBackKey, fakeBackKeyModule} from '@ink-tools/ui-kit/backKeyTest';
import App from '../App';
import {defaultSettings, EDITS, setEdit, STYLES} from '../src/edits';
import * as editor from '../src/editor';
import {EditorState} from '../src/editor';
import {Editor} from '../src/EditorView';
import {copy} from '../src/copy';

const READY: EditorState = {
  phase: 'ready',
  rect: {left: 100, top: 200, right: 300, bottom: 400},
  opened: null,
  preview: '/w/editor-1.png',
  previewKept: false,
  guided: false,
  busy: null,
  draw: null,
  marks: [],
  strokes: [],
  message: null,
};

import * as styles from '../src/styles';
import {GridState} from '../src/styles';
import {StylesGrid} from '../src/StylesGrid';

/** The kit switch with that spoken name: the outermost node that acts. */
const switchNamed = (tree: ReactTestRenderer, name: string) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityRole === 'switch' &&
      node.props.accessibilityLabel === name &&
      typeof node.props.onPress === 'function',
  )[0];

test('the Settings view keeps the size rules and lists every edit', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  expect(screenBreaks(tree.root)).toEqual([]);
  const headers = tree.root.findAllByProps({accessibilityRole: 'header'});
  expect(headers[0].props.children).toBe('Image Editing');
  for (const edit of EDITS) {
    expect(switchNamed(tree, edit.name)).toBeTruthy();
  }
});

test('Settings lists a switch per style (#133)', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  for (const style of STYLES) {
    expect(switchNamed(tree, style.name)).toBeTruthy();
  }
});

test('the Styles grid keeps the size rules, labels each tile, says when it failed and opens with the title bar (#133, #311)', async () => {
  const onPick = jest.fn();
  const onToggle = jest.fn();
  const onClose = jest.fn();
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
  // A tile never fades in: each fade step is a refresh on e-ink (brief 8.4).
  for (const image of tree.root.findAllByType(Image)) {
    expect(image.props.fadeDuration).toBe(0);
  }
  await act(async () => {
    tree.root.findByProps({testID: 'style-dither'}).props.onPress();
    switchNamed(tree, 'Thicker lines').props.onPress();
  });
  expect(onPick).toHaveBeenCalledWith('dither');
  expect(onToggle).toHaveBeenCalledWith('thick');
  expect(
    switchNamed(tree, 'White to transparent').props.accessibilityState.checked,
  ).toBe(true);
  expect(
    switchNamed(tree, 'Thicker lines').props.accessibilityState.checked,
  ).toBe(false);
  let failed!: ReactTestRenderer;
  await act(async () => {
    failed = renderer.create(
      <StylesGrid
        state={{phase: 'failed'}}
        onPick={onPick}
        onToggle={onToggle}
        onClose={onClose}
      />,
    );
  });
  expect(
    failed.root.findAllByProps({children: 'Could not make the styles'}).length,
  ).toBeGreaterThan(0);
  // The grid opens with ui-kit's title bar, whose × closes as «Close» does (#311).
  const [bar] = failed.root.findAllByType(TitleBar);
  expect(bar?.props.title).toBe(copy['edit.styles']);
  await act(async () => {
    bar.props.onClose();
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('the view asks the native module to route Back to its own root view (#226)', async () => {
  const armBackKey = jest.fn();
  let tree!: ReactTestRenderer;
  const app = (
    <RootTagContext.Provider value={11}>
      <App close={() => {}} armBackKey={armBackKey} />
    </RootTagContext.Provider>
  );
  await act(async () => {
    tree = renderer.create(app);
  });
  await act(async () => {
    tree.update(app);
  });
  // Once per root view: PluginHost never sends Back to a plugin view by itself (#204).
  expect(armBackKey.mock.calls).toEqual([[11]]);
});

test('the view arms ImageEditingBack through the shared path and logs INKTOOLS (#300)', async () => {
  // Every plugin view arms sn-adapter's module through ui-kit's useArmOnRoot (device round 14).
  const module = fakeBackKeyModule('ImageEditingBack');
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  await act(async () => {
    renderer.create(
      <RootTagContext.Provider value={11}>
        <App close={() => {}} />
      </RootTagContext.Provider>,
    );
  });
  await act(async () => {});
  expect(module.listen.mock.calls).toEqual([[11]]);
  expect(log).toHaveBeenCalledWith('INKTOOLS ImageEditingBack: back key: listening');
  log.mockRestore();
  module.restore();
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
    // In Erase, Back keeps the strokes shown erased, as Done does (#278).
    const finish = jest
      .spyOn(editor, 'finishErase')
      .mockResolvedValue(undefined);
    state.mockReturnValue({...READY, draw: 'erase'});
    await act(async () => {
      renderer.create(<App close={close} />);
    });
    back.press();
    expect(finish).toHaveBeenCalledWith(close);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

test('Settings keeps the size rules and closes with its title bar × (#224, #204, #274)', async () => {
  const close = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App close={close} />);
  });
  // screenBreaks fails a row of more than three buttons that does not wrap (#224).
  expect(screenBreaks(tree.root)).toEqual([]);
  const [closeButton] = tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'Close' &&
      typeof node.props.onPress === 'function',
  );
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
    'onUndoStroke',
    'onDone',
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

  // The editor opens with ui-kit's black title bar, never a heading text (#311).
  test.each<[string, EditorState]>([
    ['opening', {phase: 'opening'}],
    ['failed', {phase: 'failed', message: 'Sample failure'}],
    ['ready', READY],
  ])('the %s editor draws the title bar, whose × closes as Close does (#311)', async (_, state) => {
    const {tree, h} = await show(state);
    const [bar] = tree.root.findAllByType(TitleBar);
    expect(bar?.props.title).toBe(copy.title);
    const headings = tree.root.findAll(
      node =>
        typeof node.type === 'string' &&
        node.props.accessibilityRole === 'header' &&
        node.props.children === copy.title,
    );
    // The one header with the title is the bar's own.
    expect(headings).toHaveLength(1);
    if (state.phase === 'opening') {
      // «Close» waits while the editor opens, and so does the ×.
      expect(bar.props.onClose).toBeUndefined();
      return;
    }
    await act(async () => {
      bar.props.onClose();
    });
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

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

  test('nothing lassoed shows Needs: what, why, the two steps and Close (#248)', async () => {
    const {tree, h} = await show({phase: 'needs'});
    const strings = tree.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children);
    expect(strings).toEqual(
      expect.arrayContaining([
        copy['needs.lasso'],
        copy['needs.lassoReason'],
        ...copy['needs.lassoSteps'].map((step, i) => `${i + 1}. ${step}`),
      ]),
    );
    expect(strings).not.toContain(copy['press.notPicture']);
    await act(async () => {
      tree.root
        .findAll(
          node =>
            node.props.accessibilityLabel === 'Close' &&
            typeof node.props.onPress === 'function',
        )[0]
        .props.onPress();
    });
    expect(h.onClose).toHaveBeenCalledTimes(1);
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

  const strings = (tree: ReactTestRenderer) =>
    tree.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children);
  const at = (x: number, y: number) => ({
    nativeEvent: {locationX: x, locationY: y},
  });
  /** The drawn dots: the views the canvas holds beside the picture. */
  const dots = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      node =>
        typeof node.type === 'string' && node.props.pointerEvents === 'none',
    );

  test('with no mark yet, Crop and Clear marks are disabled and say why (#233)', async () => {
    const why = copy['editor.noMarks']('Crop');
    const empty = await show({...READY, draw: 'crop', marks: []});
    expect(
      empty.tree.root.findAllByProps({label: 'Crop'})[0].props.disabled,
    ).toBe(true);
    expect(strings(empty.tree)).toContain(why);
    const marked = await show({
      ...READY,
      draw: 'crop',
      marks: [[{x: 1, y: 1}]],
    });
    expect(strings(marked.tree)).not.toContain(why);
  });

  test('a Crop stroke draws nothing while the pen moves and its dots once it lifts (#278)', async () => {
    const {tree, h} = await show({
      ...READY,
      draw: 'crop',
      marks: [[{x: 150, y: 250}]],
    });
    layOut(tree);
    expect(screenBreaks(tree.root)).toEqual([]);
    const canvas = tree.root.findByProps({testID: 'editor-canvas'});
    expect(canvas.props.onStartShouldSetResponder()).toBe(true);
    expect(dots(tree)).toHaveLength(1);
    act(() => {
      canvas.props.onResponderGrant(at(0, 0));
      canvas.props.onResponderMove(at(1, 1));
      canvas.props.onResponderMove(at(40, 60));
    });
    // No dot of the stroke being drawn: a move renders nothing.
    expect(dots(tree)).toHaveLength(1);
    act(() => {
      canvas.props.onResponderRelease();
    });
    // 200 x 200 picture in a 400 x 400 stage: two view pixels per page pixel.
    expect(h.onMark).toHaveBeenCalledWith([
      {x: 100, y: 200},
      {x: 120, y: 230},
    ]);
    await act(async () => {
      tree.root.findAllByProps({label: 'Crop'})[0].props.onPress();
      tree.root.findAllByProps({label: 'Clear marks'})[0].props.onPress();
      tree.root.findAllByProps({label: 'Cancel'})[0].props.onPress();
    });
    expect(h.onApply).toHaveBeenCalledWith(
      expect.objectContaining({id: 'crop'}),
    );
    expect(h.onClear).toHaveBeenCalledTimes(1);
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });

  test('Erase shows no dot, the last erased stroke, and Done, Undo and Cancel (#278)', async () => {
    const {tree, h} = await show({...READY, draw: 'erase', marks: []});
    layOut(tree);
    expect(screenBreaks(tree.root)).toEqual([]);
    expect(tree.root.findAllByProps({label: 'Erase'})).toEqual([]);
    expect(
      tree.root.findAllByProps({label: 'Undo stroke'})[0].props.disabled,
    ).toBe(true);
    expect(strings(tree)).toContain(copy['editor.noStrokes']);
    // The hint keeps its line when it empties, so the first stroke moves nothing.
    const hintLine = (t: ReactTestRenderer) =>
      t.root.findAll(
        node =>
          typeof node.type === 'string' &&
          (node.props.children === '' ||
            node.props.children === copy['editor.noStrokes']),
      );
    expect(hintLine(tree)).toHaveLength(1);
    const canvas = tree.root.findByProps({testID: 'editor-canvas'});
    act(() => {
      canvas.props.onResponderGrant(at(0, 0));
      canvas.props.onResponderMove(at(40, 60));
    });
    expect(dots(tree)).toEqual([]);
    act(() => {
      canvas.props.onResponderRelease();
    });
    expect(h.onMark).toHaveBeenCalledTimes(1);
    const stroked = await show({
      ...READY,
      draw: 'erase',
      marks: [[{x: 150, y: 250}]],
      strokes: ['/w/1-stroke.png', '/w/2-stroke.png'],
    });
    layOut(stroked.tree);
    expect(dots(stroked.tree)).toEqual([]);
    const picture = stroked.tree.root.findByType(Image);
    expect(picture.props.source).toEqual({uri: 'file:///w/2-stroke.png'});
    // Each stroke swaps the picture: it must not fade in, a refresh per step (brief 8.4).
    expect(picture.props.fadeDuration).toBe(0);
    expect(strings(stroked.tree)).not.toContain(copy['editor.noStrokes']);
    expect(hintLine(stroked.tree)).toHaveLength(1);
    expect(
      StyleSheet.flatten(hintLine(stroked.tree)[0].props.style).minHeight,
    ).toBeGreaterThan(0);
    await act(async () => {
      stroked.tree.root
        .findAllByProps({label: 'Undo stroke'})[0]
        .props.onPress();
      stroked.tree.root.findAllByProps({label: 'Done'})[0].props.onPress();
      stroked.tree.root.findAllByProps({label: 'Cancel'})[0].props.onPress();
    });
    expect(stroked.h.onUndoStroke).toHaveBeenCalledTimes(1);
    expect(stroked.h.onDone).toHaveBeenCalledTimes(1);
    expect(stroked.h.onCancel).toHaveBeenCalledTimes(1);
  });

  test('the edit list takes its own height and the picture keeps a floor (#279)', async () => {
    const {tree} = await show(READY);
    const scroll = tree.root.findByType(ScrollView);
    const style = StyleSheet.flatten(scroll.props.style);
    expect(style).toMatchObject({flexGrow: 0, flexShrink: 1});
    const stage = tree.root.findAll(
      node =>
        typeof node.type === 'string' &&
        typeof node.props.onLayout === 'function',
    )[0];
    expect(StyleSheet.flatten(stage.props.style)).toMatchObject({
      flexGrow: 1,
      minHeight: '30%',
    });
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
