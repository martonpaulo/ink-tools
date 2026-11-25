import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {
  RowGroup,
  shared,
  SwitchGroup,
  SwitchRow,
  TitleBar,
  useBackKey,
  useWorking,
  WorkingStrip,
} from '@ink-tools/ui-kit';
import {closePluginView} from '@ink-tools/sn-adapter/official';
import {copy} from './src/copy';
import {
  askMissing,
  BUTTONS,
  isOn,
  LassoButton,
  settingsChanged,
  withSwitch,
} from './src/buttons';
import {Choice, currentChoice, onChoice} from './src/choose';
import {ChooseScreen} from './src/ui/ChooseScreen';
import {working} from './src/working';
import {getSettings, saveSettings} from './src/profile';
import {OldFolder, oldFolders} from './src/library';
import {
  defaultSettings,
  LookupSettings,
  SOURCE_NAMES,
  sourceOn,
  withSource,
} from './src/settings';

/** A source's name as Settings shows it; an unknown adapter shows its own name. */
const sourceLabel = (name: string): string =>
  ((copy as Record<string, unknown>)[`source.${name}`] as string | undefined) ??
  name;

/**
 * Lookup's Settings view: one switch per lasso button, every size and colour from the shared ui-kit
 * (#93), named as its button (#167): «Insert Sticker», «Insert Image» (#111), «Choose Image»,
 * «Insert Definition» (#115), then one «Translate ES→PT» switch per direction (#174). Each switch
 * registers or removes its button and is saved to the private folder's settings.json (#142, #22). On open, the
 * view asks for each permission a switched-on button still needs: a press with one missing opens it.
 * While «Choose picture» has a word waiting, the view is its Choose screen instead (#156); while a
 * no-view button works, it is the «Loading…» strip (#103). Settings closes by its title bar's ×, as the
 * Choose screen does by its «Close», since Back never reaches the view on the Nomad (#204, #266). «Saved pictures» says where the inserted pictures are kept and why, and names the old
 * synced folders that still hold files, with the File Manager step (#23).
 */
export default function App({
  close = () => closePluginView(),
}: {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
}) {
  const [choice, setChoice] = useState<Choice | null>(currentChoice());
  useEffect(() => onChoice(setChoice), []);
  if (useWorking(working)) {
    return <WorkingStrip working={working} />;
  }
  return choice ? (
    <ChooseScreen choice={choice} />
  ) : (
    <SettingsScreen close={close} />
  );
}

function SettingsScreen({close}: {close: () => void}) {
  useBackKey(close);
  const [settings, setSettings] = useState<LookupSettings | null>(null);
  const [old, setOld] = useState<OldFolder[]>([]);
  useEffect(() => {
    let open = true;
    getSettings().then(saved => {
      if (open) {
        setSettings(saved);
        askMissing(saved);
      }
    });
    oldFolders().then(found => open && setOld(found));
    return () => {
      open = false;
    };
  }, []);
  const shown = settings ?? defaultSettings;
  const change = (next: LookupSettings) => {
    setSettings(next);
    saveSettings(next);
    settingsChanged(next);
  };
  const group = (heading: string, buttons: readonly LassoButton[]) => (
    <RowGroup caption={heading}>
      {buttons.map(button => (
        <SwitchRow
          key={button.id}
          title={button.name}
          value={isOn(shown, button)}
          disabled={settings === null}
          onChange={on => change(withSwitch(shown, button, on))}
        />
      ))}
    </RowGroup>
  );
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={close} />
      {/* The rows outgrow the Manta's height once every switch is a row of its own (#274). */}
      <ScrollView style={styles.rows}>
        {group(
          copy['settings.modes'],
          BUTTONS.filter(button => 'key' in button.switch),
        )}
        {group(
          copy['settings.translate'],
          BUTTONS.filter(button => 'direction' in button.switch),
        )}
        <RowGroup caption={copy['settings.sources']}>
          {SOURCE_NAMES.map(name => (
            <SwitchRow
              key={name}
              title={sourceLabel(name)}
              value={sourceOn(shown, name)}
              disabled={settings === null}
              onChange={on => change(withSource(shown, name, on))}
            />
          ))}
        </RowGroup>
        {/* A row of its own, so it never reads as one more source (#275). */}
        <SwitchGroup
          title={copy['settings.dataSaver']}
          subtitle={copy['settings.dataSaverHint']}
          value={shown.dataSaver}
          disabled={settings === null}
          onChange={dataSaver => change({...shown, dataSaver})}
        />
        <RowGroup
          caption={copy['settings.pictures']}
          note={[
            copy['settings.picturesHint'],
            ...(old.length > 0 ? [copy['settings.oldFiles'](old)] : []),
          ]}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {flex: 1},
});
