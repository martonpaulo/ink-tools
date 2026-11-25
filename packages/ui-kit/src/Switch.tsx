/**
 * The native switch (#273): a bordered box that reads «ON», filled black, or «OFF», on paper, so
 * its state is a word and a fill, never grey alone. It replaces a `Button` with `selected`.
 */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {OFF_TEXT, ON_TEXT} from './controlsCopy';
import {metrics} from './metrics';
import {shared} from './styles';

export type SwitchProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  /** The setting's name, spoken with the state, such as «Sync to-dos». */
  accessibilityLabel: string;
  disabled?: boolean;
};

export function Switch({value, onChange, accessibilityLabel, disabled = false}: SwitchProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{checked: value, disabled}}
      disabled={disabled}
      style={[shared.outline, styles.box, value && styles.on, disabled && shared.disabledOutline]}
      onPress={() => onChange(!value)}>
      <Text style={[shared.text, value && styles.onText, disabled && shared.disabledText]}>
        {value ? ON_TEXT : OFF_TEXT}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    minWidth: metrics.switchWidth,
    minHeight: metrics.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: metrics.paper,
  },
  on: {backgroundColor: metrics.ink},
  onText: {color: metrics.paper},
});
