/** Smart Pen's Settings view: the shared size rules, one switch per module, and each module's settings (#305). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import App from '../App';
import {DEFAULT_PEN_SETTINGS, type PenSettings} from '../src/settings';

const mount = async (
  settings: PenSettings = DEFAULT_PEN_SETTINGS,
  close = () => {},
) => {
  const save = jest.fn(async (_next: PenSettings) => {});
  const apply = jest.fn(async (_next: PenSettings) => {});
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <App
        close={close}
        load={async () => settings}
        save={save}
        apply={apply}
      />,
    );
  });
  return {tree, save, apply};
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
