/** The native radio button (#273, #272): an ink ring, with a filled dot when chosen, in a touch target, at the native sizes. */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {metrics} from './metrics';

export type RadioProps = {
  checked: boolean;
  /**
   * Without it the radio only shows the choice: the row around it acts and speaks for it, as a
   * `ChoiceList` row does (#554).
   */
  onPress?: () => void;
  /** The choice's name, such as «English»; only a radio that acts has one. */
  accessibilityLabel?: string;
  /** A choice that cannot be picked: a dashed ring in the context grey, as a disabled switch's track (#398). */
  disabled?: boolean;
};

export function Radio({checked, onPress, accessibilityLabel, disabled = false}: RadioProps): React.JSX.Element {
  if (!onPress) {
    return (
      <View style={styles.target} importantForAccessibility="no-hide-descendants">
        <View style={[styles.ring, disabled && styles.ringDisabled]}>{checked && <View testID="radio-dot" style={styles.dot} />}</View>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{checked}}
      style={styles.target}
      onPress={onPress}>
      <View style={styles.ring}>{checked && <View testID="radio-dot" style={styles.dot} />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minWidth: metrics.touchTarget,
    minHeight: metrics.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    width: metrics.radioSize,
    height: metrics.radioSize,
    borderRadius: metrics.radioSize / 2,
    borderWidth: metrics.markStroke,
    borderColor: metrics.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringDisabled: {borderColor: metrics.context, borderStyle: 'dashed'},
  dot: {
    width: metrics.radioDot,
    height: metrics.radioDot,
    borderRadius: metrics.radioDot / 2,
    backgroundColor: metrics.ink,
  },
});
