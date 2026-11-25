/**
 * The one bordered button of every screen: black on white with the native thin ink border, at least
 * a touch target high. As in the Supernote system interface (firmware 3.31.45), black fill marks the
 * one primary action of a screen, such as OK or Start. While a finger is down, an ink bar lies along
 * the bottom edge, as the native button shows a press: one change and one more at the lift, no
 * animation (#287). A selected toggle wears the selection border, as the native screens mark a
 * chosen item (owner, #287). A disabled button, plain or primary, is a dashed outline with its label
 * in the context grey on paper, so it reads at a glance in black and white; the screen says why next
 * to it (interface rule 16, #233).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** The spoken label when the visible one is a symbol, such as ◀. */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** A toggle that is on: the selection border, the box unchanged. */
  selected?: boolean;
  /** The one primary action of the screen: black fill. */
  primary?: boolean;
};

export function Button({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  selected = false,
  primary = false,
}: ButtonProps): React.JSX.Element {
  const filled = primary && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{disabled, selected}}
      disabled={disabled}
      style={[
        shared.outline,
        styles.button,
        filled && styles.primary,
        selected && styles.selectedBox,
        disabled && shared.disabledOutline,
      ]}
      onPress={onPress}>
      {({pressed}) => (
        <>
          <Text style={[shared.text, filled && styles.primaryText, disabled && shared.disabledText]}>
            {label}
          </Text>
          {/* Both marks are drawn over the box, so neither moves the label (brief 8.4). */}
          {selected && <View testID="selection-border" style={[styles.selection, disabled && styles.selectionDisabled]} />}
          {pressed && <View testID="press-bar" style={[styles.pressBar, filled && styles.pressBarOnInk]} />}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: metrics.controlHeight,
    minWidth: metrics.touchTarget,
    paddingHorizontal: metrics.controlPadding,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: metrics.paper,
  },
  primary: {backgroundColor: metrics.ink},
  primaryText: {color: metrics.paper},
  selectedBox: {borderRadius: metrics.selectionRadius},
  // Over the button's own border, so turning a toggle on never changes the box.
  selection: {
    position: 'absolute',
    top: -metrics.border,
    left: -metrics.border,
    right: -metrics.border,
    bottom: -metrics.border,
    borderWidth: metrics.selectionStroke,
    borderRadius: metrics.selectionRadius,
    borderColor: metrics.ink,
  },
  // Disabled, the border keeps the dashed grey of a control that cannot act (#233), with no fill over the label.
  selectionDisabled: {borderStyle: 'dashed', borderColor: metrics.context},
  pressBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: metrics.pressBar,
    backgroundColor: metrics.ink,
  },
  // On a black button the bar is paper, so the press still shows.
  pressBarOnInk: {backgroundColor: metrics.paper},
});
