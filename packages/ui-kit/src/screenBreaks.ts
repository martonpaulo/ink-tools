/**
 * The size rules of a rendered screen, checked over a react-test-renderer tree (#93): no text
 * under the minimum font size, no button under the touch target, no row of more than
 * MAX_UNWRAPPED_BUTTONS buttons that does not wrap (#224). A plugin's unit test calls it on
 * each of its screens; Ink2Pic's `npm run renders` measures the same rules in a real layout.
 */
import {StyleSheet} from 'react-native';
import type {ReactTestInstance} from 'react-test-renderer';
import {metrics} from './metrics';

/** A text's readable start, so a break names it. */
const SNIPPET = 60;

const textOf = (node: ReactTestInstance): string =>
  node.children
    .map(child => (typeof child === 'string' ? child : textOf(child)))
    .join('');

/** A host node's type is its name as a string; React Native's types do not list the names. */
const hostName = (node: ReactTestInstance) =>
  typeof node.type === 'string' ? (node.type as string) : undefined;
const isText = (node: ReactTestInstance) => hostName(node) === 'Text';

/**
 * A nested text takes its size from the nearest text around it that sets one, as React Native
 * does. Composite nodes between two host texts are skipped; any other host node ends the search.
 */
function fontSizeOf(node: ReactTestInstance): unknown {
  for (let at: ReactTestInstance | null = node; at; at = at.parent) {
    const host = hostName(at);
    if (host === undefined) {
      continue;
    }
    if (host !== 'Text') {
      return undefined;
    }
    const {fontSize} = StyleSheet.flatten(at.props.style) ?? {};
    if (fontSize !== undefined) {
      return fontSize;
    }
  }
  return undefined;
}

/**
 * The most buttons a row that does not wrap may hold: more ran past the Nomad's right edge in
 * Image Editing's Settings (#224), so a longer row uses `shared.buttons`.
 */
export const MAX_UNWRAPPED_BUTTONS = 3;

/** The nearest host view above `node` that lays its children in a row, or null. */
function rowOf(node: ReactTestInstance): ReactTestInstance | null {
  for (let at = node.parent; at; at = at.parent) {
    if (hostName(at) === 'View') {
      const {flexDirection} = StyleSheet.flatten(at.props.style) ?? {};
      if (flexDirection === 'row') {
        return at;
      }
    }
  }
  return null;
}

/** Every size-rule break under `root`, as one readable line each; none is an empty list. */
export function screenBreaks(root: ReactTestInstance): string[] {
  const found: string[] = [];
  for (const node of root.findAll(isText)) {
    const fontSize = fontSizeOf(node);
    const text = textOf(node).slice(0, SNIPPET);
    if (typeof fontSize !== 'number') {
      found.push(`text «${text}» has no font size from the tokens`);
    } else if (fontSize < metrics.minFont) {
      found.push(`text «${text}» is ${fontSize} units, under ${metrics.minFont}`);
    }
  }
  const buttons = root.findAll(
    n => hostName(n) !== undefined && n.props.accessibilityRole === 'button',
  );
  for (const node of buttons) {
    const style = StyleSheet.flatten(node.props.style) ?? {};
    const name = node.props.accessibilityLabel ?? textOf(node).slice(0, SNIPPET);
    const height = style.minHeight ?? style.height;
    const width = style.minWidth ?? style.width;
    if (
      typeof height !== 'number' ||
      typeof width !== 'number' ||
      height < metrics.touchTarget ||
      width < metrics.touchTarget
    ) {
      found.push(
        `button «${name}» is ${String(width)} x ${String(height)} units, under ${metrics.touchTarget}`,
      );
    }
  }
  const rows = new Map<ReactTestInstance, string[]>();
  for (const node of buttons) {
    const row = rowOf(node);
    if (row) {
      const name = node.props.accessibilityLabel ?? textOf(node).slice(0, SNIPPET);
      rows.set(row, [...(rows.get(row) ?? []), name]);
    }
  }
  for (const [row, names] of rows) {
    const {flexWrap} = StyleSheet.flatten(row.props.style) ?? {};
    if (names.length > MAX_UNWRAPPED_BUTTONS && flexWrap !== 'wrap') {
      found.push(`row of ${names.length} buttons from «${names[0]}» does not wrap`);
    }
  }
  return found;
}
