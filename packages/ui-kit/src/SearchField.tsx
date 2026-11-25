/**
 * The native search field (#273): a bordered field with a drawn magnifier at its leading edge and a
 * grey placeholder; the placeholder is its spoken name.
 */
import React from 'react';
import {StyleSheet, TextInput, View} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

export type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmit?: () => void;
};

export function SearchField({value, onChangeText, placeholder, onSubmit}: SearchFieldProps): React.JSX.Element {
  return (
    <View style={[shared.outline, styles.field]}>
      <View testID="magnifier" style={styles.lens}>
        <View style={styles.ring} />
        <View style={styles.handle} />
      </View>
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={metrics.placeholder}
        selectionColor={metrics.selection}
        returnKeyType="search"
        style={[shared.text, styles.input]}
      />
    </View>
  );
}

const RING = Math.round(metrics.iconSize * 0.7);

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.controlGap,
    minHeight: metrics.controlHeight,
    paddingHorizontal: metrics.controlPadding,
    backgroundColor: metrics.paper,
  },
  lens: {width: metrics.iconSize, height: metrics.iconSize},
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: metrics.border,
    borderColor: metrics.ink,
  },
  handle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: metrics.iconSize - RING,
    height: metrics.border,
    backgroundColor: metrics.ink,
    transform: [{rotate: '45deg'}],
  },
  input: {flex: 1, padding: 0},
});
