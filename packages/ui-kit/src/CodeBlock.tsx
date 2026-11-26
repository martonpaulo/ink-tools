/**
 * The one box for raw text: code, JSON and logs (#405). An ink border about half the screen high;
 * the lines never wrap, so a long line stays one line and the box scrolls both ways. The outer
 * scroll is the horizontal one, so its bar stays at the bottom of the box; `persistentScrollbar`
 * keeps both bars drawn on e-ink, where a fading bar would flash. The font is the system
 * monospaced face (`monospace`, Android's alias), in ink on paper, at the minimum size.
 * No screen shows raw text outside it: the renders fail one that does (`rawBreaks`).
 */
import React from 'react';
import {ScrollView, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {metrics, textStyles} from './metrics';

/** The testID the renders find a code block by (`rawBreaks`, #405). */
export const CODE_BLOCK_ID = 'code-block';

export type CodeBlockProps = {
  /** The raw lines, shown as given: never wrapped, trimmed or reflowed. */
  lines: readonly string[];
  /** What the lines are, for a screen reader: «Probe output». */
  label: string;
};

export function CodeBlock({lines, label}: CodeBlockProps): React.JSX.Element {
  const {height} = useWindowDimensions();
  return (
    <View
      testID={CODE_BLOCK_ID}
      accessibilityLabel={label}
      style={[styles.box, {height: Math.round(height * metrics.codeBlockHeight)}]}>
      <ScrollView horizontal persistentScrollbar style={styles.fill}>
        <ScrollView
          persistentScrollbar
          nestedScrollEnabled
          style={styles.fill}
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
