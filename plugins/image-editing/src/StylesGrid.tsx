/**
 * The Styles grid (#133): two columns of large tiles, as Ink2Pic's results grid, each the lassoed
 * picture in one style on white paper, so a transparent picture lies on paper, never on black.
 * Two toggles above, White to transparent and Thicker lines; «Close» below. No slider and no
 * animation: the grid shows once all its tiles are made.
 */
import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {Button, metrics, shared} from '@supernote-tools/ui-kit';
import {copy} from './copy';
import {GridState} from './styles';
import {StyleId, StyleOptions} from './native';

const COLUMNS = 2;

export type StylesGridProps = {
  state: GridState;
  onPick: (style: StyleId) => void;
  onToggle: (option: keyof StyleOptions) => void;
  onClose: () => void;
};

export function StylesGrid({
  state,
  onPick,
  onToggle,
  onClose,
}: StylesGridProps): React.JSX.Element {
  const ready = state.phase === 'ready' ? state : null;
  const rows = ready
    ? Array.from({length: Math.ceil(ready.tiles.length / COLUMNS)}, (_, row) =>
        ready.tiles.slice(row * COLUMNS, row * COLUMNS + COLUMNS),
      )
    : [];
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy['edit.styles']}
      </Text>
      {ready ? (
        <>
          <View style={shared.row}>
            <Button
              label={copy['styles.transparent']}
              selected={ready.options.transparent}
              onPress={() => onToggle('transparent')}
            />
            <Button
              label={copy['styles.thick']}
              selected={ready.options.thick}
              onPress={() => onToggle('thick')}
            />
          </View>
          <View style={styles.grid}>
            {rows.map(row => (
              <View key={row[0].style} style={styles.row}>
                {row.map(tile => (
                  <Pressable
                    key={tile.path}
                    accessibilityRole="button"
                    accessibilityLabel={copy[`style.${tile.style}`]}
                    testID={`style-${tile.style}`}
                    onPress={() => onPick(tile.style)}
                    style={[shared.outline, styles.tile]}>
                    <Image
                      source={{uri: `file://${tile.path}`}}
                      resizeMode="contain"
                      style={styles.image}
                    />
                    <Text style={shared.text}>
                      {copy[`style.${tile.style}`]}
                    </Text>
                  </Pressable>
                ))}
                {row.length < COLUMNS ? <View style={styles.tile} /> : null}
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text accessibilityLiveRegion="polite" style={shared.text}>
          {state.phase === 'failed'
            ? copy['styles.failed']
            : copy['styles.making']}
        </Text>
      )}
      <Button
        label={copy['styles.close']}
        disabled={state.phase === 'making'}
        onPress={onClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {flex: 1, alignSelf: 'stretch', gap: metrics.tileGap},
  row: {flex: 1, flexDirection: 'row', gap: metrics.tileGap},
  tile: {
    flex: 1,
    minWidth: metrics.touchTarget,
    minHeight: metrics.touchTarget,
    backgroundColor: metrics.paper,
    alignItems: 'center',
  },
  // White behind the picture itself, so a transparent style never lies on black.
  image: {flex: 1, alignSelf: 'stretch', backgroundColor: metrics.paper},
});
