/**
 * Black fill is the one primary action; a selected toggle keeps its box and wears the selection
 * border; a press shows the native ink bar along the bottom edge (#50, #287).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
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
const marks = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll(n => n.props.testID === testID && typeof n.type === 'string');
/** The button's content while a finger is down, as Pressable draws it then. */
function pressed(props: Partial<ButtonProps> = {}) {
  const content = render(props).root.findByType(Pressable).props.children({pressed: true});
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<View>{content}</View>);
  });
  return tree;
}

describe('Button (#50)', () => {
  it.each([false, true])(
    'draws a disabled button, primary %s, as a grey dashed outline on paper (#233)',
    primary => {
      const kind = primary ? 'primary' : 'secondary';
      const off = render({kind, disabled: true});
      expect(boxStyle(off)).toMatchObject({
        borderStyle: 'dashed',
        borderColor: metrics.context,
        backgroundColor: metrics.paper,
      });
      expect(textStyle(off).color).toBe(metrics.context);
      const on = render({kind});
      expect(boxStyle(on).borderColor).toBe(metrics.ink);
      expect(boxStyle(on).borderStyle).toBeUndefined();
      expect(textStyle(on).color).toBe(primary ? metrics.paper : metrics.ink);
    },
  );

  it('fills only the primary action black', () => {
    const primary = render({kind: 'primary'});
    expect(boxStyle(primary).backgroundColor).toBe(metrics.ink);
    expect(textStyle(primary).color).toBe(metrics.paper);
    expect(boxStyle(render()).backgroundColor).toBe(metrics.paper);
  });

  it('marks a selected toggle with the selection border, not a black fill (#287)', () => {
    const selected = render({selected: true});
    expect(boxStyle(selected).backgroundColor).toBe(metrics.paper);
    expect(textStyle(selected).color).toBe(metrics.ink);
    const [border] = marks(selected, 'selection-border');
    expect(StyleSheet.flatten(border.props.style)).toMatchObject({
      position: 'absolute',
      borderWidth: metrics.selectionStroke,
      borderRadius: metrics.selectionRadius,
      borderColor: metrics.ink,
    });
    expect(selected.root.findByType(Pressable).props.accessibilityState).toMatchObject({selected: true});
    expect(marks(render(), 'selection-border')).toHaveLength(0);
    // Disabled too, the border keeps the dashed grey of a control that cannot act (#233).
    const [off] = marks(render({selected: true, disabled: true}), 'selection-border');
    expect(StyleSheet.flatten(off.props.style)).toMatchObject({borderStyle: 'dashed', borderColor: metrics.context});
    expect(StyleSheet.flatten(off.props.style).backgroundColor).toBeUndefined();
  });

  it('keeps the same size when selected, so e-ink repaints no layout', () => {
    const {borderRadius, ...selected} = boxStyle(render({selected: true}));
    expect(borderRadius).toBe(metrics.selectionRadius);
    expect(selected).toEqual(boxStyle(render()));
  });

  it.each([false, true])('shows a press, primary %s, as a bar along the bottom edge (#287)', primary => {
    const kind = primary ? 'primary' : 'secondary';
    expect(marks(render({kind}), 'press-bar')).toHaveLength(0);
    const [bar] = marks(pressed({kind}), 'press-bar');
    expect(StyleSheet.flatten(bar.props.style)).toMatchObject({
      position: 'absolute',
      bottom: 0,
      height: metrics.pressBar,
      backgroundColor: primary ? metrics.paper : metrics.ink,
    });
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

describe('the button hierarchy (#411)', () => {
  it('spans the width only for a destructive action, gives a row action the row column, and names each level', () => {
    expect(boxStyle(render({kind: 'destructive'})).alignSelf).toBe('stretch');
    expect(boxStyle(render({kind: 'secondary'})).alignSelf).toBe('flex-start');
    expect(boxStyle(render({kind: 'primary'})).alignSelf).toBe('flex-start');
    expect(boxStyle(render({kind: 'row'})).width).toBe(metrics.rowButtonWidth);
    expect(render().root.findByType(Pressable).props.nativeID).toBe('button-secondary');
    expect(render({kind: 'row'}).root.findByType(Pressable).props.nativeID).toBe('button-row');
  });
});
