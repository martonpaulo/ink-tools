/** Bridge's opt-in switches over the sync-core Settings rules (#40). */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {metrics} from '@supernote-tools/ui-kit';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import {
  BridgeSettings,
  defaultSettings,
  setModule,
  setProvider,
} from '@supernote-tools/sync-core/settings';
import {SettingsForm} from '../src/SettingsForm';
import App from '../App';

function render(settings: BridgeSettings, onChange = jest.fn()) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SettingsForm settings={settings} onChange={onChange} />,
    );
  });
  return {tree, onChange};
}

const toggle = (tree: ReactTestRenderer, label: string) =>
  tree.root.findByProps({
    accessibilityRole: 'button',
    accessibilityLabel: label,
  });
const state = (tree: ReactTestRenderer, label: string) =>
  toggle(tree, label).props.accessibilityState;

const ALL = [
  'To-Do',
  'Todoist',
  'Calendar',
  'Google',
  'iCloud',
  'ICS',
  'Digest',
];

describe('SettingsForm (#40)', () => {
  it('shows a toggle per module and per provider, all off at first start', () => {
    const {tree} = render(defaultSettings());
    for (const label of ALL) {
      expect(state(tree, label).selected).toBe(false);
    }
  });

  it('keeps a provider disabled until its module is on', () => {
    const off = render(defaultSettings()).tree;
    expect(state(off, 'Google').disabled).toBe(true);
    const on = render(setModule(defaultSettings(), 'calendar', true)).tree;
    expect(state(on, 'Google').disabled).toBe(false);
    expect(state(on, 'Todoist').disabled).toBe(true);
  });

  it('turns a module on, then a provider, through the model', () => {
    const {tree, onChange} = render(defaultSettings());
    act(() => toggle(tree, 'Calendar').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(
      setModule(defaultSettings(), 'calendar', true),
    );
    const calendarOn = setModule(defaultSettings(), 'calendar', true);
    const next = render(calendarOn);
    act(() => toggle(next.tree, 'iCloud').props.onPress());
    expect(next.onChange).toHaveBeenLastCalledWith(
      setProvider(calendarOn, 'icloud', true),
    );
  });

  it('turning a module off clears its providers', () => {
    const on = setProvider(
      setModule(defaultSettings(), 'todo', true),
      'todoist',
      true,
    );
    const {tree, onChange} = render(on);
    expect(state(tree, 'Todoist').selected).toBe(true);
    act(() => toggle(tree, 'To-Do').props.onPress());
    expect(onChange.mock.calls[0][0].providers.todoist).toBe(false);
  });

  it('draws each module name as a section heading in the context grey (#50)', () => {
    const {tree} = render(defaultSettings());
    const headings = tree.root.findAll(
      n => n.type === Text && n.props.accessibilityRole === 'header',
    );
    expect(headings.map(h => h.props.children)).toEqual([
      'To-Do',
      'Calendar',
      'Digest',
    ]);
    for (const heading of headings) {
      expect(StyleSheet.flatten(heading.props.style)).toEqual(
        expect.objectContaining({color: metrics.context, fontWeight: 'bold'}),
      );
    }
  });

  it('keeps the size rules', () => {
    expect(screenBreaks(render(defaultSettings()).tree.root)).toEqual([]);
    expect(
      screenBreaks(
        render(setModule(defaultSettings(), 'calendar', true)).tree.root,
      ),
    ).toEqual([]);
  });

  it('App shows the switches and keeps a change', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });
    act(() => toggle(tree, 'Calendar').props.onPress());
    expect(state(tree, 'Calendar').selected).toBe(true);
    expect(state(tree, 'Google').disabled).toBe(false);
    expect(screenBreaks(tree.root)).toEqual([]);
  });
});
