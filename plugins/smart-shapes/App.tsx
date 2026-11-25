import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Button, metrics, shared, TitleRow, useBackKey} from '@ink-tools/ui-kit';
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

/** One setting: its name above a row of buttons (Real-Time Conversion's look). */
function Row({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.option}>
      <Text accessibilityRole="header" style={shared.heading}>
        {title}
      </Text>
      <View style={shared.buttons}>{children}</View>
      {note ? <Text style={shared.hint}>{note}</Text> : null}
    </View>
  );
}

/**
 * Smart Shapes' Settings view (#253), every size and colour from the shared ui-kit (#93): the
 * switch, the smallest figure that becomes a shape, and each of the five shapes. A change applies
 * to the next held stroke. Close and Back close the view (#204, #255).
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
  const onOff = (title: string, on: boolean, set: (on: boolean) => void) =>
    [true, false].map(value => {
      const label = value ? copy['value.on'] : copy['value.off'];
      return (
        <Button
          key={label}
          label={label}
          accessibilityLabel={`${title}: ${label}`}
          selected={on === value}
          onPress={() => set(value)}
        />
      );
    });
  return (
    <View style={shared.screen}>
      <TitleRow title={copy.title} onClose={close} />
      <Row title={copy['settings.on']} note={copy['settings.onNote']}>
        {onOff(copy['settings.on'], settings.on, on =>
          change({...settings, on}),
        )}
      </Row>
      <Row title={copy['settings.minSize']} note={copy['settings.minSizeNote']}>
        {MIN_SIZE_CHOICES_MM.map(mm => (
          <Button
            key={mm}
            label={millimetres(mm)}
            accessibilityLabel={`${copy['settings.minSize']}: ${millimetres(
              mm,
            )}`}
            selected={settings.minSizeMm === mm}
            onPress={() => change({...settings, minSizeMm: mm})}
          />
        ))}
      </Row>
      <Row title={copy['settings.shapes']}>
        {SHAPES.map(kind => {
          const on = settings.shapes[kind];
          return (
            <Button
              key={kind}
              label={copy[`shape.${kind}`]}
              selected={on}
              onPress={() =>
                change({...settings, shapes: {...settings.shapes, [kind]: !on}})
              }
            />
          );
        })}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  /** The option's label, its buttons and its note, as Ink2Pic's Settings (#53). */
  option: {gap: metrics.rowPadding},
});
