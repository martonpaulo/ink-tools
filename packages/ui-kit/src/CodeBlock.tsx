/**
 * The one box for raw text: code, JSON and logs (#405). An ink border about half the screen high;
 * the lines never wrap, so a long line stays one line and the box scrolls both ways. The outer
 * scroll is the horizontal one, so its bar stays at the bottom of the box; the inner one is at least
 * as wide as the box, so a short log keeps its bar at the box's edge. `persistentScrollbar` keeps
 * both bars drawn on e-ink, where a fading bar would flash. The font is the system monospaced face
 * (`monospace`, Android's alias), in ink on paper, at the minimum size.
 * `fit` sizes the box to its lines instead, for one short command in a screen's steps.
 * No screen shows raw text outside it: the renders fail one that does (`rawBreaks`).
 */
import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {metrics, textStyles} from './metrics';

/** The testID the renders find a code block by (`rawBreaks`, #405). */
export const CODE_BLOCK_ID = 'code-block';

export type CodeBlockProps = {
  /** The raw lines, shown as given: never wrapped, trimmed or reflowed. */
  lines: readonly string[];
  /** What the lines are, for a screen reader: «Probe output». */
  label: string;
  /** Size the box to its lines, not half the window: for a command of a line or two. */
  fit?: boolean;
};

export function CodeBlock({lines, label, fit = false}: CodeBlockProps): React.JSX.Element {
  const {height} = useWindowDimensions();
  const [width, setWidth] = useState(0);
  return (
    <View
      testID={CODE_BLOCK_ID}
      accessibilityLabel={label}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={[styles.box, fit ? null : {height: Math.round(height * metrics.codeBlockHeight)}]}>
      <ScrollView horizontal persistentScrollbar style={fit ? null : styles.fill}>
        <ScrollView
          persistentScrollbar
          nestedScrollEnabled
          style={[fit ? null : styles.fill, {minWidth: Math.max(0, width - 2 * metrics.border)}]}
          contentContainerStyle={styles.lines}>
          {lines.map((line, index) => (
            <Text key={index} style={styles.line}>
              {line}
            </Text>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    backgroundColor: metrics.paper,
  },
  fill: {flex: 1},
  lines: {padding: metrics.controlPadding},
  line: textStyles.code,
});
