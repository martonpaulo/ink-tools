import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
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
import {getSettings, saveSettings} from './src/profile';
import {defaultSettings, LookupSettings} from './src/settings';

/**
 * Lookup's Settings view: one switch per lasso button, every size and colour from the shared ui-kit
 * (#93), named as its button (#167): «Insert Sticker», «Insert Image» (#111), «Choose Image»,
 * «Insert Definition» (#115), then one «Translate ES→PT» switch per direction (#174). Each switch
 * registers or removes its button and is saved to MyStyle/Lookup/settings.json (#142). On open, the
 * view asks for each permission a switched-on button still needs: a press with one missing opens it.
 * While «Choose picture» has a word waiting, the view is its Choose screen instead (#156).
 */
export default function App() {
  const [choice, setChoice] = useState<Choice | null>(currentChoice());
  useEffect(() => onChoice(setChoice), []);
  return choice ? <ChooseScreen choice={choice} /> : <SettingsScreen />;
}

function SettingsScreen() {
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
    </View>
  );
}
