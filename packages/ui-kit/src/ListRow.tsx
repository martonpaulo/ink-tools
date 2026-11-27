/**
 * The native list row (#273): a title, an optional subtitle under it, a leading slot for the ✓
 * of a chosen item and a trailing slot for its control (Chevron, Switch, Radio, an IconButton). A
 * row with `onPress` is one button, or one radio or switch with `control`; without it, only its
 * control acts. It has the native row's fixed
 * height and draws no line: `RowGroup` draws the line after each row (#272, #275).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

/** The `nativeID` of every list row, which the render rules find rows by (#411). */
export const LIST_ROW_ID = 'list-row';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  /**
   * A pressable row that is one radio choice or one on/off setting (#554): it speaks as that
   * control, by this label, checked or not, and its trailing `Radio` or `Switch` only shows the
   * state. A disabled one does not act, and its title and subtitle take the disabled grey, as
   * its control does.
   */
  control?: {role: 'radio' | 'switch'; label: string; checked: boolean; disabled?: boolean};
};

export function ListRow({title, subtitle, leading, trailing, onPress, control}: ListRowProps): React.JSX.Element {
  const content = (
    <>
      {leading}
      <View style={styles.texts}>
        <Text style={[shared.text, control?.disabled && shared.disabledText]}>{title}</Text>
        {subtitle !== undefined && <Text style={[shared.subtitle, control?.disabled && shared.disabledText]}>{subtitle}</Text>}
      </View>
      {trailing}
    </>
  );
  if (!onPress) {
    return (
      <View nativeID={LIST_ROW_ID} style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={control?.role ?? 'button'}
      accessibilityLabel={control?.label ?? (subtitle === undefined ? title : `${title}, ${subtitle}`)}
      // The row's label hides the texts inside it, so a control row says its subtitle as the hint.
      accessibilityHint={control ? subtitle : undefined}
      accessibilityState={control ? {checked: control.checked, disabled: control.disabled} : undefined}
      disabled={control?.disabled}
      nativeID={LIST_ROW_ID}
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
