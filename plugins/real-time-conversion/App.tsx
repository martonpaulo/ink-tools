import React, {useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {
  Choice,
  ChoiceList,
  RowGroup,
  shared,
  SwitchRow,
  TitleBar,
  useBackKey,
} from '@ink-tools/ui-kit';
import {closePluginView} from '@ink-tools/sn-adapter/official';
import {copy} from './src/copy';
import {
  getSettings,
  setSettings,
  Settings,
  Spacing,
  Wait,
} from './src/settings';

const SPACINGS: Choice<Spacing>[] = [
  {value: 'tight', label: copy['value.tight']},
  {value: 'normal', label: copy['value.normal']},
  {value: 'wide', label: copy['value.wide']},
];
const WAITS: Choice<Wait>[] = [
  {value: 'short', label: copy['value.short']},
  {value: 'normal', label: copy['value.normal']},
  {value: 'long', label: copy['value.long']},
];

/**
 * Real-Time Conversion's Settings view (#184), every size and colour from the shared ui-kit (#93):
 * the switch's start state and the word rule's two measures (#185). The word rule reads them the
 * next time Real-Time Text turns on. The title bar's × closes the view, since Back never reaches it on the
 * Nomad (#204, #266); Back still closes it on a host that sends the key.
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
      {/*
        The groups own the space above them, so they sit in a container with none (#275); it
        scrolls, since the rows outgrow the Nomad's window and the turned Manta's (#284).
      */}
      <ScrollView style={styles.rows}>
        {/* A row with no caption is its own group, so the solid line closes it (#272). */}
        <RowGroup>
          <SwitchRow
            title={copy['settings.start']}
            value={settings.startOn}
            onChange={startOn => change({...settings, startOn})}
          />
        </RowGroup>
        <ChoiceList
          title={copy['settings.spacing']}
          choices={SPACINGS}
          value={settings.spacing}
          onChange={spacing => change({...settings, spacing})}
        />
        <ChoiceList
          title={copy['settings.wait']}
          choices={WAITS}
          value={settings.wait}
          onChange={wait => change({...settings, wait})}
        />
        <RowGroup
          caption={copy['settings.font']}
          note={copy['settings.fontNote']}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {flex: 1},
});
