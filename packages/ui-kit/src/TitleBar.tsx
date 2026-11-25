/**
 * The native title bar (#273): a black band, × to close and ‹ to go back at the leading edge, the
 * title centred on the band's full width whatever sits at its edges, in the native title's size
 * and regular weight (owner, #275), and an optional second title over the left pane.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {BACK_LABEL} from './controlsCopy';
import {GlyphButton} from './GlyphButton';
import {metrics} from './metrics';
import {CLOSE_TEXT} from './problem';

export type TitleBarProps = {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
  /** The title over the left pane, such as «Settings» beside the open page's title. */
  paneTitle?: string;
};

export function TitleBar({title, onClose, onBack, paneTitle}: TitleBarProps): React.JSX.Element {
  const buttons = (onClose ? 1 : 0) + (onBack ? 1 : 0);
  // The glyph buttons' width, kept empty at the trailing edge too, so the title is centred on the
  // band's full width, as the native title bar centres it in its parent, and the × never pushes it.
  const side = {width: buttons * metrics.touchTarget + Math.max(0, buttons - 1) * metrics.controlGap};
  return (
    <View style={styles.band}>
      <View style={[styles.side, side]}>
        {onClose && (
          <GlyphButton glyph="×" accessibilityLabel={CLOSE_TEXT} color={metrics.paper} onPress={onClose} />
        )}
        {onBack && (
          <GlyphButton glyph="‹" accessibilityLabel={BACK_LABEL} color={metrics.paper} onPress={onBack} />
        )}
      </View>
      {paneTitle !== undefined && (
        <Text numberOfLines={1} style={styles.title}>
          {paneTitle}
        </Text>
      )}
      {/* Two lines at most, never cut short; the band grows with them (interface rule 9, #275). */}
      <Text accessibilityRole="header" numberOfLines={2} style={[styles.title, styles.main]}>
        {title}
      </Text>
      <View style={side} />
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: metrics.titleBarHeight,
    paddingHorizontal: metrics.controlPadding,
    gap: metrics.controlGap,
    backgroundColor: metrics.ink,
  },
  side: {flexDirection: 'row', alignItems: 'center', gap: metrics.controlGap},
  title: {fontSize: metrics.fontTitle, color: metrics.paper},
  main: {flex: 1, textAlign: 'center'},
});
