import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {copy} from './src/copy';
import {askMissing, BUTTONS, settingsChanged} from './src/buttons';
import {getSettings, saveSettings} from './src/profile';
import {defaultSettings, LookupSettings} from './src/settings';

/**
 * Lookup's Settings view: one switch per lasso button, every size and colour from the shared ui-kit
 * (#93): «Insert illustration», «Insert photo» (#111) and «Insert definition» (#115). Each switch
 * registers or removes its button and is saved to MyStyle/Lookup/settings.json (#142). On open, the
 * view asks for each permission a switched-on button still needs: a press with one missing opens it.
 */
export default function App() {
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
              onPress={() => {
                const next = {...shown, [button.key]: !shown[button.key]};
                setSettings(next);
                saveSettings(next);
                settingsChanged(next);
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
