/** Bridge's opt-in switches over the sync-core Settings rules (#40). */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {metrics} from '@ink-tools/ui-kit';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {
  addIcsFeed,
  BridgeSettings,
  defaultSettings,
  MAX_ICS_FEEDS,
  setModule,
  setProvider,
} from '@ink-tools/sync-core/settings';
import {SettingsForm} from '../src/SettingsForm';
import {copy, format} from '../src/copy';

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
  tree.root.findAll(
    node =>
      node.props.accessibilityRole === 'switch' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
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
      expect(state(tree, label).checked).toBe(false);
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
    expect(state(tree, 'Todoist').checked).toBe(true);
    act(() => toggle(tree, 'To-Do').props.onPress());
    expect(onChange.mock.calls[0][0].providers.todoist).toBe(false);
  });

  it('draws each module name, and the ICS feeds under Calendar, as a section caption in the context grey (#275, #274, #30)', () => {
    const {tree} = render(defaultSettings());
    const headings = tree.root.findAll(
      n => n.type === Text && n.props.accessibilityRole === 'header',
    );
    expect(headings.map(h => h.props.children)).toEqual([
      'To-Do',
      'Calendar',
      'ICS feeds',
      'Digest',
    ]);
    for (const heading of headings) {
      expect(StyleSheet.flatten(heading.props.style)).toEqual(
        expect.objectContaining({color: metrics.context}),
      );
    }
  });

  it('a disabled provider switch never changes the settings', () => {
    const {tree, onChange} = render(defaultSettings());
    expect(toggle(tree, 'Google').props.disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the size rules', () => {
    expect(screenBreaks(render(defaultSettings()).tree.root)).toEqual([]);
    expect(
      screenBreaks(
        render(setModule(defaultSettings(), 'calendar', true)).tree.root,
      ),
    ).toEqual([]);
  });
});

describe('the ICS feeds field (#30)', () => {
  const ICS_ON = setProvider(
    setModule(defaultSettings(), 'calendar', true),
    'ics',
    true,
  );
  const SECRET = 'https://feeds.example.com/private/token-123/calendar.ics';
  const field = (tree: ReactTestRenderer) =>
    tree.root.findByProps({accessibilityLabel: copy['ics.field']});
  const button = (tree: ReactTestRenderer, label: string) =>
    tree.root.findAll(
      node =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === 'function',
    )[0];
  const texts = (tree: ReactTestRenderer) =>
    tree.root.findAllByType(Text).map(node => node.props.children);

  it('adds a webcal address through the sync-core rule, and empties the field', () => {
    const {tree, onChange} = render(ICS_ON);
    expect(button(tree, copy['ics.add']).props.disabled).toBe(true);
    act(() =>
      field(tree).props.onChangeText(' webcal://feeds.example.com/a.ics '),
    );
    expect(button(tree, copy['ics.add']).props.disabled).toBe(false);
    act(() => button(tree, copy['ics.add']).props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(
      addIcsFeed(ICS_ON, 'webcal://feeds.example.com/a.ics'),
    );
    expect(field(tree).props.value).toBe('');
  });

  it('says why a wrong address is refused, and adds nothing', () => {
    const {tree, onChange} = render(ICS_ON);
    act(() => field(tree).props.onChangeText('ftp://feeds.example.com/a.ics'));
    act(() => button(tree, copy['ics.add']).props.onPress());
    expect(onChange).not.toHaveBeenCalled();
    const alert = tree.root.findByProps({accessibilityRole: 'alert'});
    expect(alert.props.children).toBe(copy['ics.invalid']);
  });

  it('names a feed by its place and host only, and removes it', () => {
    const one = addIcsFeed(ICS_ON, SECRET);
    const {tree, onChange} = render(one);
    const name = 'ICS 1 (feeds.example.com)';
    expect(texts(tree)).toContain(name);
    // The private path never shows (#30).
    expect(JSON.stringify(tree.toJSON())).not.toContain('token-123');
    act(() => button(tree, format('ics.removeLabel', {name})).props.onPress());
    expect(onChange.mock.calls[0][0].icsFeeds).toEqual([]);
  });

  it('acts only while Calendar and ICS are on, and says so', () => {
    const off = setProvider(ICS_ON, 'ics', false);
    const {tree} = render({...off, icsFeeds: [SECRET]});
    expect(field(tree).props.editable).toBe(false);
    expect(button(tree, copy['ics.add']).props.disabled).toBe(true);
    expect(
      button(
        tree,
        format('ics.removeLabel', {name: 'ICS 1 (feeds.example.com)'}),
      ).props.disabled,
    ).toBe(true);
    expect(texts(tree)).toContain(copy['ics.off']);
  });

  it('stops at the limit and says why', () => {
    const icsFeeds = Array.from(
      {length: MAX_ICS_FEEDS},
      (_, i) => `https://feeds.example.com/${i}.ics`,
    );
    const {tree} = render({...ICS_ON, icsFeeds});
    expect(button(tree, copy['ics.add']).props.disabled).toBe(true);
    expect(texts(tree)).toContain(
      format('ics.full', {max: String(MAX_ICS_FEEDS)}),
    );
  });

  it('keeps the size rules with feeds listed', () => {
    expect(screenBreaks(render(addIcsFeed(ICS_ON, SECRET)).tree.root)).toEqual(
      [],
    );
  });
});
