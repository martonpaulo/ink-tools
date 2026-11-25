/**
 * The native search field (#273, #287): a bordered field with a drawn magnifier at its leading edge
 * and a grey placeholder, its spoken name. As the native field, a × at its trailing edge clears the
 * text; it shows while the field has text, so an empty field shows nothing to clear. The native one
 * also hides it without focus; here it stays, since a tap outside the input takes the focus away
 * before the × gets it (interface audit, #287).
 */
import React from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {CLEAR_LABEL} from './controlsCopy';
import {CloseMark} from './marks';
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
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CLEAR_LABEL}
          style={styles.clear}
          onPress={() => onChangeText('')}>
          <CloseMark size={metrics.clearMark} color={metrics.ink} />
        </Pressable>
      )}
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
    borderWidth: metrics.markStroke,
    borderColor: metrics.ink,
  },
  handle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: metrics.iconSize - RING,
    height: metrics.markStroke,
    backgroundColor: metrics.ink,
    transform: [{rotate: '45deg'}],
  },
  // The text takes the field's full height, so the whole box is its touch target.
  input: {flex: 1, alignSelf: 'stretch', minHeight: metrics.touchTarget, padding: 0},
  clear: {
    minWidth: metrics.touchTarget,
    minHeight: metrics.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
