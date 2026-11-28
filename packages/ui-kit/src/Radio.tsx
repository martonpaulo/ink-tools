/**
 * The native radio button (#273, #272): an ink ring, with a filled dot when chosen, in a touch
 * target, at the native sizes. The ring sits at its target's trailing edge, so a choice row's ring
 * ends where the row's lines end, as the native list of radio rows draws it (owner D112, #546).
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {metrics} from './metrics';

/** The `nativeID` of the radio's ring, which the render rules find it by (#546). */
export const RADIO_RING_ID = 'radio-ring';

export type RadioProps = {
  checked: boolean;
  /**
   * Without it the radio only shows the choice: the row around it acts and speaks for it, as a
   * `ChoiceList` row does (#554).
   */
  onPress?: () => void;
  /** The choice's name, such as «English»; only a radio that acts has one. */
  accessibilityLabel?: string;
};

export function Radio({checked, onPress, accessibilityLabel}: RadioProps): React.JSX.Element {
  if (!onPress) {
    return (
      <View style={styles.target} importantForAccessibility="no-hide-descendants">
        <View nativeID={RADIO_RING_ID} style={styles.ring}>{checked && <View testID="radio-dot" style={styles.dot} />}</View>
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
      <View nativeID={RADIO_RING_ID} style={styles.ring}>{checked && <View testID="radio-dot" style={styles.dot} />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minWidth: metrics.touchTarget,
    minHeight: metrics.touchTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
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
  dot: {
    width: metrics.radioDot,
    height: metrics.radioDot,
    borderRadius: metrics.radioDot / 2,
    backgroundColor: metrics.ink,
  },
});
