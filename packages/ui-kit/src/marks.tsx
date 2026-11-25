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
function Angle({
  toward,
  height,
  color,
  stroke = metrics.markStroke,
}: {
  toward: 'left' | 'right';
  height: number;
  color: string;
  stroke?: number;
}): React.JSX.Element {
  const side = height / Math.SQRT2;
  const width = height / 2;
  // The square's centre sits on the box's edge away from the point, so its one corner is the point.
  const arms =
    toward === 'right'
      ? {left: -side / 2, borderTopWidth: stroke, borderRightWidth: stroke}
      : {left: width - side / 2, borderBottomWidth: stroke, borderLeftWidth: stroke};
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

/**
 * Two strokes crossing in a square: the title bar's ×, in paper on the band, at the native size by
 * default; the field's × that clears its text passes its own size and ink.
 */
export function CloseMark({
  size = metrics.closeMark,
  color = metrics.paper,
}: {size?: number; color?: string}): React.JSX.Element {
  const length = Math.round(size * Math.SQRT2);
  const stroke = [styles.closeStroke, {width: length, backgroundColor: color}];
  return (
    <View importantForAccessibility="no-hide-descendants" style={[styles.closeBox, {width: size, height: size}]}>
      <View style={[stroke, {transform: [{rotate: '45deg'}]}]} />
      <View style={[stroke, {transform: [{rotate: '-45deg'}]}]} />
    </View>
  );
}

/**
 * The pager's arrows, drawn as the native ones (#287): ‹ or ›, with a bar at the point for the
 * first and the last page, |‹ and ›|; out of reach, grey and half as thick, as the native arrow
 * turns pale, so the state is never grey alone (#233).
 */
export function PageArrow({
  toward,
  edge = false,
  disabled = false,
}: {
  toward: 'left' | 'right';
  edge?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const color = disabled ? metrics.context : metrics.ink;
  const stroke = disabled ? metrics.markStroke / 2 : metrics.markStroke;
  const bar = edge && <View style={[styles.pageBar, {backgroundColor: color, width: stroke}]} />;
  return (
    <View importantForAccessibility="no-hide-descendants" testID="page-arrow" style={styles.pageArrow}>
      {toward === 'left' && bar}
      <Angle toward={toward} height={metrics.pagerArrow} color={color} stroke={stroke} />
      {toward === 'right' && bar}
    </View>
  );
}

/** The ⓘ of the loading box, as the native one (#287): a ring with a dot over a bar. */
export function InfoMark(): React.JSX.Element {
  return (
    <View importantForAccessibility="no-hide-descendants" style={styles.info}>
      <View style={styles.infoDot} />
      <View style={styles.infoBar} />
    </View>
  );
}

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * The static loading mark of a full view that loads (#287): eight short round-ended rays around a
 * centre, as the native one; it never turns, since each frame costs an e-ink refresh.
 */
export function LoadingMark(): React.JSX.Element {
  const size = metrics.loadingMark;
  const stroke = size * metrics.loadingRayStroke;
  const ray = {
    position: 'absolute' as const,
    top: size * metrics.loadingRayStart,
    left: (size - stroke) / 2,
    width: stroke,
    height: size * metrics.loadingRayLength,
    borderRadius: stroke / 2,
    backgroundColor: metrics.ink,
  };
  return (
    <View importantForAccessibility="no-hide-descendants" testID="loading-mark" style={{width: size, height: size}}>
      {RAYS.map(angle => (
        <View key={angle} style={[StyleSheet.absoluteFill, {transform: [{rotate: `${angle}deg`}]}]}>
          <View style={ray} />
        </View>
      ))}
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
  closeBox: {justifyContent: 'center', alignItems: 'center'},
  closeStroke: {position: 'absolute', height: metrics.markStroke},
  pageArrow: {flexDirection: 'row', alignItems: 'center', height: metrics.pagerArrow},
  pageBar: {width: metrics.markStroke, height: metrics.pagerArrow},
  info: {
    width: metrics.loadingIcon,
    height: metrics.loadingIcon,
    borderRadius: metrics.loadingIcon / 2,
    borderWidth: metrics.markStroke,
    borderColor: metrics.ink,
    justifyContent: 'center',
    alignItems: 'center',
    gap: metrics.markStroke,
  },
  infoDot: {
    width: metrics.markStroke,
    height: metrics.markStroke,
    borderRadius: metrics.markStroke / 2,
    backgroundColor: metrics.ink,
  },
  infoBar: {width: metrics.markStroke, height: metrics.loadingIcon / 2 - metrics.markStroke, backgroundColor: metrics.ink},
  caption: {minHeight: metrics.captionHeight, justifyContent: 'flex-end'},
});
