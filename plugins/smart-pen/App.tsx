import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {
  Choice,
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
import {MODULES} from './src/modules';
import {copy as textCopy} from './src/modules/text/copy';
import type {Spacing, Wait} from './src/modules/text/settings';
import {copy as shapesCopy} from './src/modules/shapes/copy';
import type {ShapeKind} from './src/modules/shapes/recognize';
import {MIN_SIZE_CHOICES_MM} from './src/modules/shapes/settings';
import {getSettings, saveSettings} from './src/profile';
import {applySettings} from './src/runtime';
import type {PenSettings} from './src/settings';

const SPACINGS: Choice<Spacing>[] = [
  {value: 'tight', label: textCopy['value.tight']},
  {value: 'normal', label: textCopy['value.normal']},
  {value: 'wide', label: textCopy['value.wide']},
];
const WAITS: Choice<Wait>[] = [
  {value: 'short', label: textCopy['value.short']},
  {value: 'normal', label: textCopy['value.normal']},
  {value: 'long', label: textCopy['value.long']},
];
/** The five shapes in the order #253 names them. */
const SHAPES: ShapeKind[] = ['triangle', 'circle', 'square', 'rect', 'arrow'];
const SIZES = MIN_SIZE_CHOICES_MM.map(mm => ({
  value: mm,
  label: shapesCopy['value.mm'].replace('{mm}', String(mm)),
}));

/**
 * Smart Pen's Settings view (#305), every size and colour from the shared ui-kit (#93): one switch
 * per module, then the settings of each module that is on. A switch starts or stops its module at
 * once and is written to the settings file, so it survives a restart. The title bar's × closes the
 * view, since Back never reaches it on the Nomad (#204, #266); Back still closes it on a host that
 * sends the key.
 */
export default function App({
  close = () => closePluginView(),
  load = getSettings,
  save = saveSettings,
  apply = applySettings,
}: {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
  /** The settings store and the runtime; tests pass fakes. */
  load?: () => Promise<PenSettings>;
  save?: (next: PenSettings) => Promise<void>;
  apply?: (next: PenSettings) => Promise<void>;
}) {
  useBackKey(close);
  const [settings, setLocal] = useState<PenSettings | null>(null);
  useEffect(() => {
    let live = true;
    load().then(loaded => {
      if (live) {
        setLocal(loaded);
      }
    });
    return () => {
      live = false;
    };
  }, [load]);
  const change = (next: PenSettings) => {
    setLocal(next);
    apply(next).catch(error =>
      console.log(`SmartPen: apply: ${String(error)}`),
    );
    save(next).catch(error => console.log(`SmartPen: save: ${String(error)}`));
  };
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={close} />
      {/*
        The groups own the space above them, so they sit in a container with none (#275); it
        scrolls, since the rows outgrow the Nomad's window and the turned Manta's (#284). Until the
        settings file is read the view shows only its title.
      */}
      {settings && (
        <ScrollView style={styles.rows}>
          <RowGroup caption={copy['settings.modules']}>
            {MODULES.map(row => (
              <SwitchRow
                key={row.id}
                title={row.title}
                subtitle={row.note}
                value={settings.modules[row.id]}
                onChange={on =>
                  change({
                    ...settings,
                    modules: {...settings.modules, [row.id]: on},
                  })
                }
              />
            ))}
          </RowGroup>
          {settings.modules.text && (
            <>
              <SwitchGroup
                title={textCopy['settings.start']}
                value={settings.text.startOn}
                onChange={startOn =>
                  change({...settings, text: {...settings.text, startOn}})
                }
              />
              <ChoiceList
                title={textCopy['settings.spacing']}
                choices={SPACINGS}
                value={settings.text.spacing}
                onChange={spacing =>
                  change({...settings, text: {...settings.text, spacing}})
                }
              />
              <ChoiceList
                title={textCopy['settings.wait']}
                choices={WAITS}
                value={settings.text.wait}
                onChange={wait =>
                  change({...settings, text: {...settings.text, wait}})
                }
              />
              <RowGroup
                caption={textCopy['settings.font']}
                note={textCopy['settings.fontNote']}
              />
            </>
          )}
          {settings.modules.shapes && (
            <>
              <ChoiceList
                title={shapesCopy['settings.minSize']}
                choices={SIZES}
                value={settings.shapes.minSizeMm}
                onChange={minSizeMm =>
                  change({...settings, shapes: {...settings.shapes, minSizeMm}})
                }
                note={shapesCopy['settings.minSizeNote']}
              />
              <RowGroup caption={shapesCopy['settings.shapes']}>
                {SHAPES.map(kind => (
                  <SwitchRow
                    key={kind}
                    title={shapesCopy[`shape.${kind}`]}
                    value={settings.shapes.shapes[kind]}
                    onChange={on =>
                      change({
                        ...settings,
                        shapes: {
                          ...settings.shapes,
                          shapes: {...settings.shapes.shapes, [kind]: on},
                        },
                      })
                    }
                  />
                ))}
              </RowGroup>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {flex: 1},
});
