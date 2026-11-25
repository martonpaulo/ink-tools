import React, {useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {
  ChoiceList,
  RowGroup,
  shared,
  SwitchGroup,
  SwitchRow,
  TitleBar,
  useBackKey,
} from '@ink-tools/ui-kit';
import {closePluginView} from '@ink-tools/sn-adapter/official';
import {copy} from './src/copy';
import type {ShapeKind} from './src/recognize';
import {
  getSettings,
  MIN_SIZE_CHOICES_MM,
  setSettings,
  Settings,
} from './src/settings';

/** The five shapes in the order the issue names them (#253). */
const SHAPES: ShapeKind[] = ['triangle', 'circle', 'square', 'rect', 'arrow'];

const millimetres = (mm: number) =>
  copy['value.mm'].replace('{mm}', String(mm));
const SIZES = MIN_SIZE_CHOICES_MM.map(mm => ({
  value: mm,
  label: millimetres(mm),
}));

/**
 * Smart Shapes' Settings view (#253), drawn with the kit's native controls (#274): the switch, the
 * smallest figure that becomes a shape, and each of the five shapes. A change applies to the next
 * held stroke. The title bar's × and Back close the view (#204, #255).
 */
export default function App({
  close = () => closePluginView(),
}: {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
}) {
  useBackKey(close);
  const [settings, setLocal] = useState<Settings>(getSettings);
  const change = (next: Settings) => {
    setSettings(next);
    setLocal(next);
  };
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={close} />
      {/* One row per size and per shape outgrows the Manta's height (#274). */}
      <ScrollView style={styles.rows}>
        <SwitchGroup
          title={copy['settings.on']}
          subtitle={copy['settings.onNote']}
          value={settings.on}
          onChange={on => change({...settings, on})}
        />
        <ChoiceList
          title={copy['settings.minSize']}
          choices={SIZES}
          value={settings.minSizeMm}
          onChange={minSizeMm => change({...settings, minSizeMm})}
          note={copy['settings.minSizeNote']}
        />
        <RowGroup caption={copy['settings.shapes']}>
          {SHAPES.map(kind => (
            <SwitchRow
              key={kind}
              title={copy[`shape.${kind}`]}
              value={settings.shapes[kind]}
              onChange={on =>
                change({...settings, shapes: {...settings.shapes, [kind]: on}})
              }
            />
          ))}
        </RowGroup>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {flex: 1},
});
