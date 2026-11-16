import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {shared} from '@supernote-tools/ui-kit';
import {copy} from './src/copy';
import {EditsForm} from './src/EditsForm';
import {defaultSettings} from './src/edits';
import {syncButtons} from './src/buttons';
import {askFilePermissions} from './src/permissions';

/**
 * Retouch's Settings view: one switch per edit (#136), every size and colour from the shared
 * ui-kit (#93). Each switch also registers or removes its lasso button.
 */
export default function App() {
  // shortcut: the settings live in memory and reset when Retouch restarts, as Lingo's do; upgrade
  // when the plugin storage lands (#40).
  const [settings, setSettings] = useState(defaultSettings);
  useEffect(() => {
    askFilePermissions();
  }, []);
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <EditsForm
        settings={settings}
        onChange={next => {
          setSettings(next);
          syncButtons(next);
        }}
      />
    </View>
  );
}
