import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {
  Button,
  shared,
  useBackKey,
  useWorking,
  WorkingStrip,
} from '@supernote-tools/ui-kit';
import {closePluginView} from '@supernote-tools/sn-adapter/official';
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
 * registers or removes its button and is saved to MyStyle/Lookup/settings.json (#142). On open, the
 * view asks for each permission a switched-on button still needs: a press with one missing opens it.
 * While «Choose picture» has a word waiting, the view is its Choose screen instead (#156); while a
 * no-view button works, it is the «Loading…» strip (#103). Back closes Settings, as it leaves the
 * Choose screen by its «Close» (#204).
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
    return <WorkingStrip />;
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
  useEffect(() => {
    let open = true;
    getSettings().then(saved => {
      if (open) {
        setSettings(saved);
        askMissing(saved);
      }
    });
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
    <View style={shared.listRow}>
      <Text accessibilityRole="header" style={shared.heading}>
        {heading}
      </Text>
      <View style={shared.row}>
        {buttons.map(button => {
          const on = isOn(shown, button);
          return (
            <Button
              key={button.id}
              label={button.name}
              selected={on}
              disabled={settings === null}
              onPress={() => change(withSwitch(shown, button, !on))}
            />
          );
        })}
      </View>
    </View>
  );
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      {group(
        copy['settings.modes'],
        BUTTONS.filter(button => 'key' in button.switch),
      )}
      {group(
        copy['settings.translate'],
        BUTTONS.filter(button => 'direction' in button.switch),
      )}
      <View style={shared.listRow}>
        <Text accessibilityRole="header" style={shared.heading}>
          {copy['settings.sources']}
        </Text>
        <View style={shared.row}>
          {SOURCE_NAMES.map(name => {
            const on = sourceOn(shown, name);
            return (
              <Button
                key={name}
                label={sourceLabel(name)}
                selected={on}
                disabled={settings === null}
                onPress={() => change(withSource(shown, name, !on))}
              />
            );
          })}
        </View>
      </View>
      <View style={shared.listRow}>
        <Text accessibilityRole="header" style={shared.heading}>
          {copy['settings.dataSaver']}
        </Text>
        <Text style={shared.hint}>{copy['settings.dataSaverHint']}</Text>
        <View style={shared.row}>
          <Button
            label={copy['settings.dataSaver']}
            selected={shown.dataSaver}
            disabled={settings === null}
            onPress={() => change({...shown, dataSaver: !shown.dataSaver})}
          />
        </View>
      </View>
    </View>
  );
}
