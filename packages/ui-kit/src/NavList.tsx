/**
 * The native left navigation list (#273): an optional icon and a label per item, a dotted separator
 * under each, and the open item marked by an ink bar at its trailing edge, never by grey alone.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

export type NavItem = {key: string; label: string; icon?: React.ReactNode};

export type NavListProps = {
  items: NavItem[];
  openKey: string;
  onOpen: (key: string) => void;
};

export function NavList({items, openKey, onOpen}: NavListProps): React.JSX.Element {
  return (
    <View accessibilityRole="list">
      {items.map(item => {
        const open = item.key === openKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{selected: open}}
            style={styles.item}
            onPress={() => onOpen(item.key)}>
            {item.icon}
            <Text style={[shared.text, styles.label]}>{item.label}</Text>
            {open && <View testID="open-mark" style={styles.mark} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.controlGap,
    minHeight: metrics.touchTarget,
    minWidth: metrics.touchTarget,
    paddingHorizontal: metrics.controlPadding,
    borderBottomWidth: metrics.border,
    borderStyle: 'dotted',
    borderColor: metrics.ink,
  },
  label: {flex: 1},
  mark: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: metrics.navMarkWidth,
    backgroundColor: metrics.ink,
  },
});
