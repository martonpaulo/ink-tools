/**
 * The Styles grid (#133): two columns of large tiles, as Ink2Pic's results grid, each the lassoed
 * picture in one style on white paper, so a transparent picture lies on paper, never on black.
 * ui-kit's black title bar on top, as every full view opens (#311), whose × runs «Close». Two
 * switch rows below it, White to transparent and Thicker lines (#274); «Close» below. No slider and no
 * animation: the grid shows once all its tiles are made. A failure shows ui-kit's ErrorView (#528).
 */
import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {Button, ErrorView, metrics, RowGroup, shared, SwitchRow, TitleBar} from '@ink-tools/ui-kit';
import {copy} from './copy';
import {GridState} from './styles';
import {StyleId, StyleOptions} from './native';

const COLUMNS = 2;

export type StylesGridProps = {
  state: GridState;
  onPick: (style: StyleId) => void;
  onToggle: (option: keyof StyleOptions) => void;
  onRetry: () => void;
  onClose: () => void;
};

export function StylesGrid({
  state,
  onPick,
  onToggle,
  onRetry,
  onClose,
}: StylesGridProps): React.JSX.Element {
  if (state.phase === 'failed') {
    // A failure ends the grid: ui-kit's ErrorView, with the reason and Retry (#528).
    return (
      <ErrorView
        problem={{
          what: copy['styles.failed'],
          reason: copy[`styles.failed.${state.reason}`],
        }}
        onRetry={onRetry}
        onClose={onClose}
      />
    );
  }
  const ready = state.phase === 'ready' ? state : null;
  const rows = ready
    ? Array.from({length: Math.ceil(ready.tiles.length / COLUMNS)}, (_, row) =>
        ready.tiles.slice(row * COLUMNS, row * COLUMNS + COLUMNS),
      )
    : [];
  return (
    <View style={shared.screen}>
      <TitleBar
        title={copy['edit.styles']}
        onClose={state.phase === 'making' ? undefined : onClose}
      />
      {ready ? (
        <>
          <RowGroup>
            <SwitchRow
              title={copy['styles.transparent']}
              value={ready.options.transparent}
              onChange={() => onToggle('transparent')}
            />
            <SwitchRow
              title={copy['styles.thick']}
              value={ready.options.thick}
              onChange={() => onToggle('thick')}
            />
          </RowGroup>
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
                      // No fade-in: each fade step is a refresh on e-ink (brief 8.4).
                      fadeDuration={0}
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
          {copy['styles.making']}
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
