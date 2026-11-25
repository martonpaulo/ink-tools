/**
 * The native icon buttons (#273): ⊖ remove, the trash to delete and the arrow to download, drawn
 * with views from the tokens, never a native drawable, each in a touch target with its spoken name.
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {DELETE_LABEL, DOWNLOAD_LABEL, REMOVE_LABEL} from './controlsCopy';
import {metrics} from './metrics';

export type IconKind = 'remove' | 'delete' | 'download';

const LABELS: Record<IconKind, string> = {
  remove: REMOVE_LABEL,
  delete: DELETE_LABEL,
  download: DOWNLOAD_LABEL,
};

export type IconButtonProps = {
  kind: IconKind;
  onPress: () => void;
  /** The spoken name when the kind's own is not enough, such as «Delete English». */
  accessibilityLabel?: string;
};

export function IconButton({kind, onPress, accessibilityLabel}: IconButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? LABELS[kind]}
      style={styles.target}
      onPress={onPress}>
      <View testID={`icon-${kind}`} style={styles.icon}>
        {kind === 'remove' && (
          <View style={styles.ring}>
            <View style={styles.minus} />
          </View>
        )}
        {kind === 'delete' && (
          <>
            <View style={styles.lid} />
            <View style={styles.bin} />
          </>
        )}
        {kind === 'download' && (
          <>
            <View style={styles.stem} />
            <View style={styles.head} />
            <View style={styles.tray} />
          </>
        )}
      </View>
    </Pressable>
  );
}

const ICON = metrics.iconSize;
const HALF = Math.round(ICON / 2);
/** The native icons' stroke, as the ⊖ of Keyboard draws it (#272, #287). */
const STROKE = metrics.markStroke;

const styles = StyleSheet.create({
  target: {
    minWidth: metrics.touchTarget,
    minHeight: metrics.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {width: ICON, height: ICON, alignItems: 'center'},
  ring: {
    width: ICON,
    height: ICON,
    borderRadius: HALF,
    borderWidth: STROKE,
    borderColor: metrics.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  minus: {width: HALF, height: STROKE, backgroundColor: metrics.ink},
  lid: {width: ICON, height: STROKE, backgroundColor: metrics.ink},
  bin: {
    flex: 1,
    width: ICON - STROKE * 2,
    borderWidth: STROKE,
    borderTopWidth: 0,
    borderColor: metrics.ink,
  },
  stem: {flex: 1, width: STROKE, backgroundColor: metrics.ink},
  head: {
    width: HALF,
    height: HALF,
    marginTop: -HALF,
    borderRightWidth: STROKE,
    borderBottomWidth: STROKE,
    borderColor: metrics.ink,
    transform: [{rotate: '45deg'}],
  },
  tray: {width: ICON, height: STROKE, marginTop: STROKE, backgroundColor: metrics.ink},
});
