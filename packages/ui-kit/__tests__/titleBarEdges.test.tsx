/** The title bar runs from edge to edge at the top, as NOTE's native band does (#309). */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {metrics, shared, TitleBar} from '../src';
import {TITLE_BAR_ID} from '../src/TitleBar';
import {barBreaks, breaksOf, Box, Measured, missingBarBreaks} from '../renders/rules';

const SCREEN: Box = {left: 0, top: 0, right: 1024, bottom: 1365};
const pad = metrics.screenPadding;
const FULL: Box = {...SCREEN, bottom: metrics.titleBarHeight};
const INSET: Box = {
  left: pad,
  top: pad,
  right: SCREEN.right - pad,
  bottom: pad + metrics.titleBarHeight,
};
const bar = (box: Box) => ({name: 'the title bar', box});

describe('barBreaks (#309)', () => {
  it('passes a bar that touches the top, left and right edges', () => {
    expect(barBreaks({screen: SCREEN, bars: [bar(FULL)]})).toEqual([]);
  });

  it('fails a bar inset by the screen padding', () => {
    expect(barBreaks({screen: SCREEN, bars: [bar(INSET)]})).toEqual([
      "the title bar does not touch the screen's top, left, right edge",
    ]);
  });

  it('holds what sits in the bar to the edges, not the padding', () => {
    const close = {
      name: 'Close',
      width: metrics.touchTarget,
      height: metrics.titleBarHeight,
      box: {left: 0, top: 0, right: metrics.touchTarget, bottom: metrics.titleBarHeight},
      bar: true,
    };
    const measured: Measured = {screen: SCREEN, targets: [close], texts: [], scrolls: [], bars: [bar(FULL)]};
    expect(breaksOf(measured, metrics)).toEqual([]);
    expect(breaksOf({...measured, targets: [{...close, bar: false}]}, metrics)).toEqual([
      '«Close» reaches into the screen padding',
    ]);
  });
});

describe('missingBarBreaks (#311)', () => {
  it('passes a full view with a title bar and fails one without', () => {
    expect(missingBarBreaks({bars: [bar(FULL)]})).toEqual([]);
    expect(missingBarBreaks({bars: []})).toEqual([
      "has no title bar: a full view opens with ui-kit's TitleBar",
    ]);
  });
});

describe('TitleBar in a screen (#309)', () => {
  it('reaches back over the screen padding on the top and both sides', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <View style={shared.screen}>
          <TitleBar title="Sample" onClose={() => {}} />
        </View>,
      );
    });
    const band = tree.root.find(node => node.type === View && node.props.testID === TITLE_BAR_ID);
    const style = StyleSheet.flatten(band.props.style);
    const screen = StyleSheet.flatten(shared.screen);
    expect(style.marginTop).toBe(-(screen.padding as number));
    expect(style.marginHorizontal).toBe(-(screen.padding as number));
  });
});
