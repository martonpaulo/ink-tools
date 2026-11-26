/** The one box for raw text (#405): half the window high, both scroll directions, a monospaced face. */
import React from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {CODE_BLOCK_ID, CodeBlock, metrics} from '../src';
import {Box, Measured, rawBreaks} from '../renders/rules';
import {screenBreaks} from '../src/screenBreaks';

const LONG = `runtime keys: ${Array.from({length: 40}, (_, i) => `sampleKey${i}`).join(',')}`;

const mount = (lines: string[]) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<CodeBlock lines={lines} label="Sample output" />);
  });
  return tree;
};
const block = (tree: ReactTestRenderer) =>
  tree.root.find(node => node.props.testID === CODE_BLOCK_ID && typeof node.type === 'string');
const scrolls = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as unknown) === 'RCTScrollView');
const lineTexts = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as unknown) === 'Text' && typeof node.props.children === 'string');

describe('CodeBlock (#405)', () => {
  it('is an ink box about half the window high, named for a screen reader', () => {
    const tree = mount(['probe done']);
    const style = StyleSheet.flatten(block(tree).props.style);
    let height = 0;
    function Window() {
      height = useWindowDimensions().height;
      return null;
    }
    act(() => {
      renderer.create(<Window />);
    });
    expect(style.height).toBe(Math.round(height * metrics.codeBlockHeight));
    expect(metrics.codeBlockHeight).toBe(0.5);
    expect(style.borderWidth).toBe(metrics.border);
    expect(style.borderColor).toBe(metrics.ink);
    expect(block(tree).props.accessibilityLabel).toBe('Sample output');
  });

  it('scrolls sideways outside and down inside, with bars that stay drawn', () => {
    const [outer, inner] = scrolls(mount([LONG, 'probe done']));
    expect(outer.props.horizontal).toBe(true);
    expect(inner.props.horizontal).toBeFalsy();
    expect([outer.props.persistentScrollbar, inner.props.persistentScrollbar]).toEqual([true, true]);
  });

  it('shows each line whole, once, in a monospaced ink face at the minimum size, never cut', () => {
    const texts = lineTexts(mount([LONG, '', 'probe done']));
    expect(texts.map(text => text.props.children)).toEqual([LONG, '', 'probe done']);
    for (const text of texts) {
      const style = StyleSheet.flatten(text.props.style);
      expect(style).toMatchObject({fontFamily: 'monospace', color: metrics.ink, fontSize: metrics.minFont});
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });

  it('keeps its box with no lines and with thousands, and keeps the size rules', () => {
    const empty = mount([]);
    const many = mount(Array.from({length: 2000}, (_, i) => `line ${i}`));
    expect(StyleSheet.flatten(block(empty).props.style).height).toBe(StyleSheet.flatten(block(many).props.style).height);
    expect(lineTexts(empty)).toEqual([]);
    expect(screenBreaks(many.root)).toEqual([]);
  });
});

const BOX: Box = {left: 20, top: 400, right: 1004, bottom: 1080};
const text = (value: string, flags: {code?: boolean; monospace?: boolean} = {}) => ({
  name: value,
  text: value,
  fontSize: metrics.minFont,
  glyphs: BOX,
  within: [],
  ...flags,
});
const screen = (texts: Measured['texts']): Measured => ({
  screen: {left: 0, top: 0, right: 1024, bottom: 1365},
  targets: [],
  texts,
  scrolls: [],
  bars: [],
});

describe('rawBreaks (#405)', () => {
  const RAW = [LONG, 'probe done'];

  it('fails a fixture screen that shows raw lines in a plain Text', () => {
    expect(rawBreaks(screen([text('Plugin Diagnostics'), text(LONG), text('probe done')]), RAW)).toEqual([
      `raw text «${LONG.slice(0, 60)}» shows outside ui-kit's CodeBlock`,
      "raw text «probe done» shows outside ui-kit's CodeBlock",
    ]);
  });

  it('passes the same lines inside the code block', () => {
    expect(rawBreaks(screen([text('Plugin Diagnostics'), text(LONG, {code: true}), text('probe done', {code: true})]), RAW)).toEqual([]);
  });

  it('fails a monospaced text outside the block, even one the screen did not list as raw', () => {
    expect(rawBreaks(screen([text('{"ok":true}', {monospace: true})]))).toEqual([
      'text «{"ok":true}» is monospaced outside ui-kit\'s CodeBlock',
    ]);
  });
});
