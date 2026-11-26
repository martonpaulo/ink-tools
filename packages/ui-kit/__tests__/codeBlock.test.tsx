/** The one box for raw text (#405): half the window high, up and down only with wrapped lines, a monospaced face, «Copy». */
import React from 'react';
import {Clipboard, StyleSheet, ToastAndroid, useWindowDimensions} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {CODE_BLOCK_ID, CodeBlock, metrics} from '../src';
import {Box, Measured, rawBreaks} from '../renders/rules';
import {screenBreaks} from '../src/screenBreaks';
import {COPIED_TEXT} from '../src/controlsCopy';

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
  block(tree).findAll(node => (node.type as unknown) === 'Text' && typeof node.props.children === 'string');

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

  it('scrolls up and down only, with its bar kept drawn and no sideways scroll (owner, 2026-11-26)', () => {
    const all = scrolls(mount([LONG, 'probe done']));
    expect(all).toHaveLength(1);
    expect(all[0].props.horizontal).toBeFalsy();
    expect(all[0].props.persistentScrollbar).toBe(true);
  });

  it('shows each line whole, once, in a monospaced ink face at the minimum size, wrapped and never cut', () => {
    const texts = lineTexts(mount([LONG, '', 'probe done']));
    expect(texts.map(text => text.props.children)).toEqual([LONG, '', 'probe done']);
    for (const text of texts) {
      const style = StyleSheet.flatten(text.props.style);
      expect(style).toMatchObject({fontFamily: 'monospace', color: metrics.ink, fontSize: metrics.minFont});
      expect(text.props.numberOfLines).toBeUndefined();
      expect(style.flexShrink).not.toBe(0);
    }
  });

  // The real copy runs, against React Native's jest mock of the clipboard module: a test that
  // passed its own copy let a broken import ship (device round 6, #405).
  it('copies the whole text to the clipboard with «Copy» and says so, and offers no Copy with nothing to copy', () => {
    const setString = jest.spyOn(Clipboard, 'setString');
    const toast = jest.spyOn(ToastAndroid, 'show');
    const tree = mount([LONG, 'probe done']);
    const button = tree.root.find(node => node.props.accessibilityLabel === 'Copy: Sample output' && node.props.nativeID !== undefined);
    expect(button.props.nativeID).toBe('button-secondary');
    act(() => button.props.onPress());
    expect(setString).toHaveBeenCalledWith(`${LONG}\nprobe done`);
    expect(toast).toHaveBeenCalledWith(COPIED_TEXT, ToastAndroid.SHORT);
    expect(mount([]).root.findAll(node => node.props.accessibilityLabel === 'Copy: Sample output')).toHaveLength(0);
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
  rows: [],
  texts,
  scrolls: [],
  bars: [],
});

describe('rawBreaks (#405)', () => {
  const RAW = [LONG, 'probe done'];

  it('fails a fixture screen that shows raw lines in a plain Text', () => {
    expect(rawBreaks(screen([text('Ink Tools Probe'), text(LONG), text('probe done')]), RAW)).toEqual([
      `raw text «${LONG.slice(0, 60)}» shows outside ui-kit's CodeBlock`,
      "raw text «probe done» shows outside ui-kit's CodeBlock",
    ]);
  });

  it('passes the same lines inside the code block', () => {
    expect(rawBreaks(screen([text('Ink Tools Probe'), text(LONG, {code: true}), text('probe done', {code: true})]), RAW)).toEqual([]);
  });

  it("fails a code line that runs past the block's side, and passes one wrapped inside it (#405)", () => {
    const inside = {...text(LONG, {code: true}), codeBox: BOX};
    expect(rawBreaks(screen([inside]))).toEqual([]);
    const past = {...inside, glyphs: {...BOX, right: BOX.right + 400}};
    expect(rawBreaks(screen([past]))).toEqual([
      `code line «${LONG.slice(0, 60)}» runs past the code block's side: its lines wrap`,
    ]);
  });

  it('fails a monospaced text outside the block, even one the screen did not list as raw', () => {
    expect(rawBreaks(screen([text('{"ok":true}', {monospace: true})]))).toEqual([
      'text «{"ok":true}» is monospaced outside ui-kit\'s CodeBlock',
    ]);
  });
});
