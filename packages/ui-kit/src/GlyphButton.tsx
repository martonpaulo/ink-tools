/**
 * A control drawn as one glyph, such as × or ‹, with its spoken name: a touch target in each
 * direction, whatever the glyph's own size (#273). The title bar and the pager use it.
 */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

export type GlyphButtonProps = {
  glyph: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** The glyph's colour: ink on paper, paper on the title bar's band. */
  color?: string;
};

export function GlyphButton({
  glyph,
  accessibilityLabel,
  onPress,
  disabled = false,
  color = metrics.ink,
}: GlyphButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled}}
      disabled={disabled}
      style={styles.target}
      onPress={onPress}>
      <Text style={[shared.textLarge, {color}, disabled && shared.disabledText]}>
        {glyph}
      </Text>
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
});
