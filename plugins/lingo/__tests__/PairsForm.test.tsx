/** Lingo's language-pair switches over ink-core's pairs model (#126). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import {
  defaultSettings,
  LingoSettings,
  PAIRS,
  setPair,
} from '@supernote-tools/ink-core';
import {pairLabel, PairsForm} from '../src/PairsForm';
import App from '../App';

function render(settings: LingoSettings, onChange = jest.fn()) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <PairsForm settings={settings} onChange={onChange} />,
    );
  });
  return {tree, onChange};
}

const toggle = (tree: ReactTestRenderer, label: string) =>
  tree.root.findByProps({
    accessibilityRole: 'button',
    accessibilityLabel: label,
  });

describe('PairsForm (#126)', () => {
  it('names each pair in words', () => {
    expect(pairLabel(['es', 'pt'])).toBe('Spanish – Portuguese');
    expect(pairLabel(['zh', 'pt'])).toBe('Chinese – Portuguese');
  });

  it('shows one switch per pair in PAIRS, all off at first start', () => {
    const {tree} = render(defaultSettings());
    // Host views only: a composite repeats its props on each level of the tree.
    const buttons = tree.root.findAll(
      n => typeof n.type === 'string' && n.props.accessibilityRole === 'button',
    );
    expect(buttons.map(b => b.props.accessibilityLabel)).toEqual(
      PAIRS.map(p => pairLabel(p.languages)),
    );
    for (const b of buttons) {
      expect(b.props.accessibilityState.selected).toBe(false);
    }
  });

  it('turns a pair on and off through setPair', () => {
    const {tree, onChange} = render(defaultSettings());
    act(() => toggle(tree, 'Spanish – Portuguese').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(
      setPair(defaultSettings(), 'es-pt', true),
    );
    const on = render(setPair(defaultSettings(), 'es-pt', true));
    expect(
      toggle(on.tree, 'Spanish – Portuguese').props.accessibilityState.selected,
    ).toBe(true);
    act(() => toggle(on.tree, 'Spanish – Portuguese').props.onPress());
    expect(on.onChange).toHaveBeenLastCalledWith(
      setPair(defaultSettings(), 'es-pt', false),
    );
  });

  it('keeps the ui-kit size rules on the Settings view, and a tap changes it', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });
    expect(screenBreaks(tree.root)).toEqual([]);
    act(() => toggle(tree, 'Chinese – Portuguese').props.onPress());
    expect(
      toggle(tree, 'Chinese – Portuguese').props.accessibilityState.selected,
    ).toBe(true);
  });
});
