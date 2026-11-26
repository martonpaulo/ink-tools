/**
 * The one box for raw text: code, JSON and logs (#405). An ink border about half the screen high
 * that scrolls up and down only: a long line wraps inside the box, so nothing runs past its sides
 * and there is no sideways bar (owner, 2026-11-26). `persistentScrollbar` keeps the vertical bar
 * drawn at the box's edge on e-ink, where a fading bar would flash. The font is the system
 * monospaced face (`monospace`, Android's alias), in ink on paper, at the minimum size.
 * «Copy», a secondary button at the box's top right, puts the whole text on the clipboard and says
 * so in a short toast (owner, 2026-11-26).
 * `fit` sizes the box to its lines instead, for one short command in a screen's steps.
 * No screen shows raw text outside it: the renders fail one that does (`rawBreaks`).
 */
import React from 'react';
// React Native's own clipboard module: sn-plugin-lib has none, and this is the public React Native
// API the host's runtime ships (level 1). It is read from the package root, whose getter returns
// the module's default export; the deep path's typings name a `Clipboard` export the file does not
// have, so a named import there is undefined at run time (#405). shortcut: the core module is marked
// for removal in a later React Native; move to its successor package when the pinned version drops it.
import {Clipboard, ScrollView, StyleSheet, Text, ToastAndroid, useWindowDimensions, View} from 'react-native';
import {Button} from './Button';
import {COPIED_TEXT, COPY_LABEL} from './controlsCopy';
import {metrics, textStyles} from './metrics';
import {shared} from './styles';

/** The testID the renders find a code block by (`rawBreaks`, #405). */
export const CODE_BLOCK_ID = 'code-block';

/** Puts `text` on the tablet's clipboard and says so in a short toast, both public React Native API. */
export const copyToClipboard = (text: string): void => {
  Clipboard.setString(text);
  ToastAndroid.show(COPIED_TEXT, ToastAndroid.SHORT);
};

export type CodeBlockProps = {
  /** The raw lines, shown as given: never trimmed or reflowed, only wrapped at the box's side. */
  lines: readonly string[];
  /** What the lines are, for a screen reader: «Probe output». */
  label: string;
  /** Size the box to its lines, not half the window: for a command of a line or two. */
  fit?: boolean;
};

export function CodeBlock({lines, label, fit = false}: CodeBlockProps): React.JSX.Element {
  const {height} = useWindowDimensions();
  return (
    <View style={styles.block}>
      {/* Nothing to copy, no Copy: a button that cannot act would need a line saying why. */}
      {lines.length > 0 && (
        <View style={shared.actions}>
          <Button
            label={COPY_LABEL}
            accessibilityLabel={`${COPY_LABEL}: ${label}`}
            onPress={() => copyToClipboard(lines.join('\n'))}
          />
        </View>
      )}
      <View
        testID={CODE_BLOCK_ID}
        accessibilityLabel={label}
        style={[styles.box, fit ? null : {height: Math.round(height * metrics.codeBlockHeight)}]}>
        <ScrollView persistentScrollbar style={fit ? null : styles.fill} contentContainerStyle={styles.lines}>
          {lines.map((line, index) => (
            <Text key={index} style={styles.line}>
              {line}
            </Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {gap: metrics.controlGap},
  box: {
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    backgroundColor: metrics.paper,
  },
  fill: {flex: 1},
  lines: {padding: metrics.controlPadding},
  line: textStyles.code,
});
