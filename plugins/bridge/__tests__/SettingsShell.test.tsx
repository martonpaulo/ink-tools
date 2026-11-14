/** Bridge's Settings shell: its states, its header, and the shared size rules (#93). */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import {SettingsShell, ShellState} from '../src/SettingsShell';
import {copy} from '../src/copy';

function render(state: ShellState) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SettingsShell state={state} />);
  });
  return tree;
}
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => node.props.children);

const STATES: Record<string, ShellState> = {
  loading: {kind: 'loading'},
  error: {kind: 'error', reason: 'storage did not answer', onRetry: () => {}},
  empty: {kind: 'ready', modules: []},
  modules: {
    kind: 'ready',
    modules: [
      {id: 'calendar', name: 'Calendar'},
      {id: 'todo', name: 'To-do', unavailable: 'the To-Do provider did not answer'},
    ],
  },
};

describe('SettingsShell (#93)', () => {
  it.each(Object.keys(STATES))('keeps the size rules in the %s state', name => {
    expect(screenBreaks(render(STATES[name]).root)).toEqual([]);
  });

  it('marks the title as a header', () => {
    const title = render(STATES.empty).root.findByProps({accessibilityRole: 'header'});
    expect(title.props.children).toBe(copy.title);
  });

  it('shows loading, the empty state and the error with its reason', () => {
    expect(texts(render(STATES.loading))).toContain(copy['settings.loading']);
    expect(texts(render(STATES.empty))).toContain(copy['settings.empty']);
    expect(texts(render(STATES.error))).toContain(
      'The settings did not load: storage did not answer',
    );
  });

  it('retries from the error state', () => {
    const onRetry = jest.fn();
    const tree = render({kind: 'error', reason: 'x', onRetry});
    act(() => tree.root.findByProps({accessibilityRole: 'button'}).props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says in words why a module is unavailable', () => {
    expect(texts(render(STATES.modules))).toEqual([
      copy.title,
      'Calendar',
      'To-do',
      'Not available: the To-Do provider did not answer',
    ]);
  });
});
