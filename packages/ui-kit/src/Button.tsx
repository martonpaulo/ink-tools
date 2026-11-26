/**
 * The one bordered button of every screen: black on white with the native thin ink border, at least
 * a touch target high. As in the Supernote system interface (firmware 3.31.45), black fill marks the
 * one primary action of a screen, such as OK or Start. While a finger is down, an ink bar lies along
 * the bottom edge, as the native button shows a press: one change and one more at the lift, no
 * animation (#287). A selected toggle wears the selection border, as the native screens mark a
 * chosen item (owner, #287). A disabled button, plain or primary, is a dashed outline with its label
 * in the context grey on paper, so it reads at a glance in black and white; the screen says why next
 * to it (interface rule 16, #233).
 *
 * One hierarchy, after the native catalog (#411): `primary`, the one main action of a screen, the
 * small filled black button such as «Scan»; `secondary`, an outlined button that keeps its label's
 * width; `row`, the action at a settings row's trailing edge, `rowButtonWidth` wide so the actions
 * of every row share a column (`ActionRow`); `destructive`, the outlined button that spans the
 * screen's width at the end of a page, as the native «Uninstall». Only a destructive button spans
 * the width; the renders fail any other that does, and a row action outside a row (#411).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

/** The four levels of action (#411); the renders read the level from the button's `nativeID`. */
export type ButtonKind = 'primary' | 'secondary' | 'row' | 'destructive';
export const BUTTON_KINDS: readonly ButtonKind[] = ['primary', 'secondary', 'row', 'destructive'];
/** The `nativeID` a button of `kind` carries, which the render rules read (#411). */
export const buttonId = (kind: ButtonKind) => `button-${kind}`;

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** The spoken label when the visible one is a symbol, such as ◀. */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** A toggle that is on: the selection border, the box unchanged. */
  selected?: boolean;
  /** Its level in the hierarchy; `secondary` when left out. */
  kind?: ButtonKind;
};

export function Button({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  selected = false,
  kind = 'secondary',
}: ButtonProps): React.JSX.Element {
  const filled = kind === 'primary' && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{disabled, selected}}
      disabled={disabled}
      nativeID={buttonId(kind)}
      style={[
        shared.outline,
        styles.button,
        styles[kind],
        filled && styles.filled,
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
  // Each level's box: only a destructive button takes the full width of its column (#411).
  primary: {alignSelf: 'flex-start', minWidth: metrics.smallButtonWidth},
  secondary: {alignSelf: 'flex-start'},
  // A row's action keeps the touch target, not the taller control height, so it sits inside the native row (#272).
  row: {width: metrics.rowButtonWidth, minHeight: metrics.touchTarget},
  destructive: {alignSelf: 'stretch'},
  filled: {backgroundColor: metrics.ink},
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
