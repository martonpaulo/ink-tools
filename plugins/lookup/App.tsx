import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {copy} from './src/copy';
import {askMissing, BUTTONS, settingsChanged} from './src/buttons';
import {Choice, currentChoice, onChoice} from './src/choose';
import {ChooseScreen} from './src/ui/ChooseScreen';
import {PairsForm} from './src/ui/PairsForm';
import {getSettings, saveSettings} from './src/profile';
import {defaultSettings, LookupSettings} from './src/settings';

/**
 * Lookup's Settings view: one switch per lasso button, every size and colour from the shared ui-kit
 * (#93): «Insert illustration», «Insert photo» (#111), «Insert definition» (#115) and «Insert
 * translation», with its language pairs below the buttons (#158). Each switch
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
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <View style={shared.listRow}>
        <Text accessibilityRole="header" style={shared.heading}>
          {copy['settings.modes']}
        </Text>
        <View style={shared.row}>
          {BUTTONS.map(button => (
            <Button
              key={button.key}
              label={button.name}
              selected={shown[button.key]}
              disabled={settings === null}
              onPress={() =>
                change({...shown, [button.key]: !shown[button.key]})
              }
            />
          ))}
        </View>
      </View>
      <PairsForm
        pairs={shown.pairs}
        disabled={settings === null}
        onChange={pairs => change({...shown, pairs})}
      />
    </View>
  );
}
