import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {copy} from './src/copy';
import {defaultSettings, settingsChanged} from './src/buttons';

/**
 * Lookup's Settings view: one switch per lasso mode, every size and colour from the shared ui-kit
 * (#93). «Insert definition» is the first (#115); the picture modes join with #111. Each switch
 * also registers or removes its lasso button.
 */
export default function App() {
  const [settings, setSettings] = useState(defaultSettings);
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
          <Button
            label={copy['button.define']}
            selected={settings.definition}
            onPress={() => {
              const next = {...settings, definition: !settings.definition};
              setSettings(next);
              settingsChanged(next);
            }}
          />
        </View>
      </View>
    </View>
  );
}
