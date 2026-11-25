/**
 * The native list row (#273): a title, an optional subtitle under it, a leading slot for the ✓
 * of a chosen item and a trailing slot for its control (Chevron, Switch, Radio, an IconButton). A
 * row with `onPress` is one button; without it, only its control acts. It has the native row's fixed
 * height and draws no line: `RowGroup` draws the line after each row (#272, #275).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
};

export function ListRow({title, subtitle, leading, trailing, onPress}: ListRowProps): React.JSX.Element {
  const content = (
    <>
      {leading}
      <View style={styles.texts}>
        <Text style={shared.text}>{title}</Text>
        {subtitle !== undefined && <Text style={shared.subtitle}>{subtitle}</Text>}
      </View>
      {trailing}
    </>
  );
  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle === undefined ? title : `${title}, ${subtitle}`}
      style={[styles.row, styles.target]}
      onPress={onPress}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.controlGap,
    // The native fixed height holds the touch target and two lines; no padding adds to it (#272).
    minHeight: metrics.rowHeight,
  },
  target: {minWidth: metrics.touchTarget},
  texts: {flex: 1},
});
