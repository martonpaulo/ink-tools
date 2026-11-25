/** The native radio button (#273): an ink ring, with a filled dot when chosen, in a touch target. */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {metrics} from './metrics';

export type RadioProps = {
  checked: boolean;
  onPress: () => void;
  /** The choice's name, such as «English». */
  accessibilityLabel: string;
};

export function Radio({checked, onPress, accessibilityLabel}: RadioProps): React.JSX.Element {
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
    borderWidth: metrics.border,
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
