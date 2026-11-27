/**
 * The native switch (#273, #272): the word «ON» or «OFF» beside a pill-shaped track; on, the track
 * is filled black with a paper knob at its trailing end; off, it is an ink outline with an ink knob
 * at its leading end. Its state is a word and a fill, never grey alone. Disabled, the outline and the
 * word take the context grey and the outline is dashed (#233). As the native one, the word sits
 * before the track, which is twice as wide as it is tall, and the knob is the same size on and off,
 * with one gap to the track's outer edge on every side (#287).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {OFF_TEXT, ON_TEXT} from './controlsCopy';
import {metrics} from './metrics';
import {shared} from './styles';

export type SwitchProps = {
  value: boolean;
  disabled?: boolean;
} & (
  | {
      onChange: (value: boolean) => void;
      /** The setting's name, spoken with the state, such as «Sync to-dos». */
      accessibilityLabel: string;
    }
  | {
      /** None: the switch only shows the state; the row around it acts and speaks for it, as a `SwitchRow` does (#554). */
      onChange?: undefined;
      accessibilityLabel?: undefined;
    }
);

export function Switch({value, onChange, accessibilityLabel, disabled = false}: SwitchProps): React.JSX.Element {
  const look = (
    <>
      <Text style={[shared.subtitle, disabled && shared.disabledText]}>{value ? ON_TEXT : OFF_TEXT}</Text>
      <View
        testID="switch-track"
        style={[styles.track, value && styles.trackOn, disabled && styles.trackDisabled]}>
        <View testID="switch-knob" style={[styles.knob, value && styles.knobOn, disabled && styles.knobDisabled]} />
      </View>
    </>
  );
  if (!onChange) {
    return (
      <View style={styles.target} importantForAccessibility="no-hide-descendants">
        {look}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{checked: value, disabled}}
      disabled={disabled}
      style={styles.target}
      onPress={() => onChange(!value)}>
      {look}
    </Pressable>
  );
}

/** The knob's gap to the track's outer edge, the same on every side, as the native one. */
const KNOB_INSET = (metrics.switchHeight - metrics.switchKnob) / 2 - metrics.markStroke;

const styles = StyleSheet.create({
  target: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.switchWordGap,
    minWidth: metrics.touchTarget,
    minHeight: metrics.touchTarget,
  },
  track: {
    width: metrics.switchWidth,
    height: metrics.switchHeight,
    borderRadius: metrics.switchHeight / 2,
    borderWidth: metrics.markStroke,
    borderColor: metrics.ink,
    backgroundColor: metrics.paper,
    paddingHorizontal: KNOB_INSET,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  trackOn: {backgroundColor: metrics.ink, alignItems: 'flex-end'},
  trackDisabled: {borderColor: metrics.context, borderStyle: 'dashed', backgroundColor: metrics.paper},
  knob: {
    width: metrics.switchKnob,
    height: metrics.switchKnob,
    borderRadius: metrics.switchKnob / 2,
    backgroundColor: metrics.ink,
  },
  knobOn: {backgroundColor: metrics.paper},
  knobDisabled: {backgroundColor: metrics.context},
});
