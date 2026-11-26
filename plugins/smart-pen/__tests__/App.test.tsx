/** Smart Pen's Settings view: the shared size rules, one switch per module, and each module's settings (#305). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey, fakeBackKeyModule} from '@ink-tools/ui-kit/backKeyTest';
import {WorkingStrip} from '@ink-tools/ui-kit';
import {pressables, quietWorking, shownTexts} from '@ink-tools/ui-kit/problemTest';
import App from '../App';
import {copy} from '../src/copy';
import {copy as textCopy} from '../src/modules/text/copy';
import {DEFAULT_PEN_SETTINGS, type PenSettings} from '../src/settings';

const mount = async (
  settings: PenSettings = DEFAULT_PEN_SETTINGS,
  close = () => {},
  {
    load = async () => settings,
    save = jest.fn(async (_next: PenSettings) => {}),
  }: {
    load?: () => Promise<PenSettings>;
    save?: (next: PenSettings) => Promise<void>;
  } = {},
) => {
  const apply = jest.fn(async (_next: PenSettings) => {});
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <App close={close} load={load} save={save} apply={apply} />,
    );
  });
  return {tree, save: save as jest.Mock, apply};
};

const control = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
const labels = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(
      node =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel !== undefined,
    )
    .map(node => node.props.accessibilityLabel as string);

test('the Settings view keeps the size rules and has a header', async () => {
  const {tree} = await mount();
  expect(screenBreaks(tree.root)).toEqual([]);
  const headers = tree.root.findAllByProps({accessibilityRole: 'header'});
  expect(headers[0].props.children).toBe('Smart Pen');
});

test('each module has a switch, and a tap applies and saves it', async () => {
  const {tree, save, apply} = await mount();
  act(() => control(tree, 'Smart Shapes').props.onPress());
  const next = {...DEFAULT_PEN_SETTINGS, modules: {text: true, shapes: false}};
  expect(apply).toHaveBeenLastCalledWith(next);
  expect(save).toHaveBeenLastCalledWith(next);
  expect(control(tree, 'Smart Shapes').props.accessibilityState.checked).toBe(
    false,
  );
});

test("an off module's settings leave the view", async () => {
  const {tree} = await mount({
    ...DEFAULT_PEN_SETTINGS,
    modules: {text: false, shapes: true},
  });
  expect(labels(tree)).not.toContain('Start with Real-Time Text on');
  expect(labels(tree)).toContain('Arrow');
  const both = await mount({
    ...DEFAULT_PEN_SETTINGS,
    modules: {text: false, shapes: false},
  });
  expect(labels(both.tree)).not.toContain('Arrow');
  expect(labels(both.tree)).toContain('Real-Time Text');
});

test("each module's settings change and are saved", async () => {
  const {tree, save} = await mount();
  act(() => control(tree, 'Word spacing: Wide').props.onPress());
  expect(save.mock.calls[0][0].text.spacing).toBe('wide');
  act(() => control(tree, 'Smallest shape: 24 mm').props.onPress());
  expect(save.mock.calls[1][0].shapes.minSizeMm).toBe(24);
  act(() => control(tree, 'Arrow').props.onPress());
  expect(save.mock.calls[2][0].shapes.shapes.arrow).toBe(false);
  // Each change starts from the last one, so none is lost.
  expect(save.mock.calls[2][0].text.spacing).toBe('wide');
});

test('Close and Back close the Settings view (#204, #266)', async () => {
  const back = catchBackKey();
  const close = jest.fn();
  const {tree} = await mount(DEFAULT_PEN_SETTINGS, close);
  expect(back.press()).toBe(true);
  act(() => control(tree, 'Close').props.onPress());
  expect(close).toHaveBeenCalledTimes(2);
  back.restore();
});

const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(
      node =>
        typeof node.type === 'string' && typeof node.props.children === 'string',
    )
    .map(node => node.props.children as string);

test('a settings file that cannot be read shows the defaults with a note', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const {tree} = await mount(DEFAULT_PEN_SETTINGS, () => {}, {
    load: async () => {
      throw new Error('no file');
    },
  });
  expect(control(tree, 'Smart Shapes').props.accessibilityState.checked).toBe(
    true,
  );
  expect(texts(tree)).toContain(
    'Could not read the settings file, so these are the defaults. A change is kept until the tablet restarts.',
  );
  // The failure keeps ui-kit's title bar and its Close (#257).
  expect(control(tree, 'Close')).toBeDefined();
  log.mockRestore();
});

test('a change that fails to save is put back and said', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const {tree} = await mount(DEFAULT_PEN_SETTINGS, () => {}, {
    save: async () => {
      throw new Error('disk full');
    },
  });
  await act(async () => {
    control(tree, 'Smart Shapes').props.onPress();
  });
  expect(control(tree, 'Smart Shapes').props.accessibilityState.checked).toBe(
    true,
  );
  expect(texts(tree)).toContain(
    'Could not apply or save that change. Try again.',
  );
  expect(control(tree, 'Close')).toBeDefined();
  log.mockRestore();
});

test("Real-Time Text's own settings sit under its name", async () => {
  const {tree} = await mount();
  expect(texts(tree).filter(text => text === 'Real-Time Text').length).toBe(2);
});

test('the view shows Close before the settings file is read (#257)', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App load={() => new Promise(() => {})} />);
  });
  expect(control(tree, 'Close')).toBeDefined();
  expect(labels(tree)).not.toContain('Smart Shapes');
});

test('a button that failed on the tablet shows the Error state with its reason and Close, in place of Settings (#257)', async () => {
  const working = quietWorking({failed: copy['working.failed'], timeout: copy['working.timeout']});
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <App working={working} close={() => {}} load={async () => DEFAULT_PEN_SETTINGS} save={async () => {}} apply={async () => {}} />,
    );
  });
  await act(async () => {
    working.hold({what: textCopy['toast.undoFailed'], reason: textCopy['error.again']});
  });
  expect(tree.root.findAllByType(WorkingStrip).length).toBe(1);
  expect(shownTexts(tree.root)).toEqual([textCopy['toast.undoFailed'], textCopy['error.again']]);
  const [close] = pressables(tree.root);
  await act(async () => {
    close.props.onPress();
  });
  expect(working.problem()).toBeNull();
  expect(tree.root.findAllByType(WorkingStrip).length).toBe(0);
});

test('the view arms its own Back key module once, so Back never reaches the note (#300)', async () => {
  // Device round 9: Back on a plugin view with no module closed the note behind it.
  const module = fakeBackKeyModule('SmartPenBack');
  await mount();
  await act(async () => {});
  expect(module.listen).toHaveBeenCalledTimes(1);
  module.restore();
});
