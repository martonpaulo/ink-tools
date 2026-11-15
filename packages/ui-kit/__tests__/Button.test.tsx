/** Black fill is the one primary action; a selected toggle keeps its box and gains a bar (#50). */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {Button, ButtonProps} from '../src/Button';
import {metrics} from '../src/metrics';

function render(props: Partial<ButtonProps> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <Button label="Library" onPress={jest.fn()} {...props} />,
    );
  });
  return tree;
}
const boxStyle = (tree: ReactTestRenderer) =>
  StyleSheet.flatten(tree.root.findByType(Pressable).props.style);
const textStyle = (tree: ReactTestRenderer) =>
  StyleSheet.flatten(tree.root.findByType(Text).props.style);
const bars = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    n => n.props.testID === 'selected-bar' && !n.props.children,
  );

describe('Button (#50)', () => {
  it('fills only the primary action black', () => {
    const primary = render({primary: true});
    expect(boxStyle(primary).backgroundColor).toBe(metrics.ink);
    expect(textStyle(primary).color).toBe(metrics.paper);
    expect(boxStyle(render()).backgroundColor).toBe(metrics.paper);
  });

  it('marks a selected toggle with a bar under the label, not a black fill', () => {
    const selected = render({selected: true});
    expect(boxStyle(selected).backgroundColor).toBe(metrics.paper);
    expect(textStyle(selected).color).toBe(metrics.ink);
    expect(bars(selected).length).toBeGreaterThan(0);
    expect(
      selected.root.findByType(Pressable).props.accessibilityState,
    ).toMatchObject({selected: true});
    expect(bars(render())).toHaveLength(0);
  });

  it('keeps the same box when selected, so e-ink repaints no layout', () => {
    expect(boxStyle(render({selected: true}))).toEqual(boxStyle(render()));
    const bar = StyleSheet.flatten(
      bars(render({selected: true}))[0].props.style,
    );
    expect(bar.position).toBe('absolute');
  });
});

/** WCAG relative luminance of a #rrggbb grey. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('Grey as colour (#50)', () => {
  it('keeps every grey that carries text at 7:1 or more on paper', () => {
    const paper = luminance(metrics.paper);
    for (const grey of [metrics.ink, metrics.context, metrics.placeholder]) {
      expect((paper + 0.05) / (luminance(grey) + 0.05)).toBeGreaterThanOrEqual(7);
    }
  });
});
