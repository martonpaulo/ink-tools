/**
 * The native title bar (#273): a black band, × to close and ‹ to go back at the leading edge, the
 * title centred, and an optional second title over the left pane of a two-pane screen.
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
  return (
    <View style={styles.band}>
      {onClose && (
        <GlyphButton glyph="×" accessibilityLabel={CLOSE_TEXT} color={metrics.paper} onPress={onClose} />
      )}
      {onBack && (
        <GlyphButton glyph="‹" accessibilityLabel={BACK_LABEL} color={metrics.paper} onPress={onBack} />
      )}
      {paneTitle !== undefined && (
        <Text numberOfLines={1} style={styles.title}>
          {paneTitle}
        </Text>
      )}
      <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, styles.main]}>
        {title}
      </Text>
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
  title: {fontSize: metrics.fontBody, fontWeight: 'bold', color: metrics.paper},
  main: {flex: 1, textAlign: 'center'},
});
