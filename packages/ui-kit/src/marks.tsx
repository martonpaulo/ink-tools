/**
 * The native marks that do not act by themselves (#273): the ✓ on the leading side of a chosen row,
 * the › that says a row opens a page, and the grey section caption with no row of its own.
 */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

/** A ✓ when checked; unchecked, the same width empty, so the rows' titles stay in one column. */
export function CheckMark({checked}: {checked: boolean}): React.JSX.Element {
  return (
    <Text importantForAccessibility="no" style={[shared.textLarge, styles.mark]}>
      {checked ? '✓' : ''}
    </Text>
  );
}

export function Chevron(): React.JSX.Element {
  return (
    <Text importantForAccessibility="no" style={shared.textLarge}>
      ›
    </Text>
  );
}

/**
 * A caption such as «Installed Languages»: bold grey, with no gap under it, so it reads as the head
 * of the rows it names and apart from a grey hint; `RowGroup` draws it and the gap above (#275).
 */
export function SectionCaption({children}: {children: string}): React.JSX.Element {
  return (
    <Text accessibilityRole="header" style={shared.heading}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: {minWidth: metrics.iconSize, textAlign: 'center'},
});
