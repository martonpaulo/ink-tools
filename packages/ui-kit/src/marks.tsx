/**
 * The native marks that do not act by themselves (#273): the ✓ on the leading side of a chosen row,
 * the › that says a row opens a page, the × and ‹ of the title bar, and the section caption with no
 * row of its own. ×, ‹ and › are drawn as strokes at the native size, not as text glyphs, whose
 * size changes with the font (#272).
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {metrics} from './metrics';
import {shared} from './styles';

/** A ✓ when checked; unchecked, the same width empty, so the rows' titles stay in one column. */
export function CheckMark({checked}: {checked: boolean}): React.JSX.Element {
  return (
    <Text importantForAccessibility="no" style={[shared.textLarge, styles.check]}>
      {checked ? '✓' : ''}
    </Text>
  );
}

/**
 * Two strokes at a right angle, pointing `toward`, `height` tall: the native › and ‹. A square with
 * two borders, turned 45°, whose diagonal is the height.
 */
function Angle({toward, height, color}: {toward: 'left' | 'right'; height: number; color: string}): React.JSX.Element {
  const side = height / Math.SQRT2;
  const width = height / 2;
  // The square's centre sits on the box's edge away from the point, so its one corner is the point.
  const arms =
    toward === 'right'
      ? {left: -side / 2, borderTopWidth: metrics.markStroke, borderRightWidth: metrics.markStroke}
      : {left: width - side / 2, borderBottomWidth: metrics.markStroke, borderLeftWidth: metrics.markStroke};
  return (
    <View importantForAccessibility="no-hide-descendants" style={[styles.angleBox, {width, height}]}>
      <View
        style={[
          styles.angle,
          {top: (height - side) / 2, width: side, height: side, borderColor: color},
          arms,
        ]}
      />
    </View>
  );
}

/** The › at a row's trailing edge: the row opens a page. */
export function Chevron(): React.JSX.Element {
  return <Angle toward="right" height={metrics.chevronHeight} color={metrics.ink} />;
}

/** The title bar's ‹, in paper on the band. */
export function BackMark(): React.JSX.Element {
  return <Angle toward="left" height={metrics.backMarkHeight} color={metrics.paper} />;
}

/** The title bar's ×: two strokes crossing in a square of the native size, in paper on the band. */
export function CloseMark(): React.JSX.Element {
  const length = Math.round(metrics.closeMark * Math.SQRT2);
  return (
    <View importantForAccessibility="no-hide-descendants" style={styles.closeBox}>
      <View style={[styles.closeStroke, {width: length, transform: [{rotate: '45deg'}]}]} />
      <View style={[styles.closeStroke, {width: length, transform: [{rotate: '-45deg'}]}]} />
    </View>
  );
}

/**
 * A caption such as «Installed Languages»: ink, the row's size and regular weight, at the bottom of
 * the native caption's box, so it reads as the head of the rows under it (#272); `RowGroup` draws it.
 */
export function SectionCaption({children}: {children: string}): React.JSX.Element {
  return (
    <View style={styles.caption}>
      <Text accessibilityRole="header" style={shared.heading}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  check: {minWidth: metrics.iconSize, textAlign: 'center'},
  angleBox: {overflow: 'hidden'},
  angle: {position: 'absolute', transform: [{rotate: '45deg'}]},
  closeBox: {
    width: metrics.closeMark,
    height: metrics.closeMark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeStroke: {position: 'absolute', height: metrics.markStroke, backgroundColor: metrics.paper},
  caption: {minHeight: metrics.captionHeight, justifyContent: 'flex-end'},
});
