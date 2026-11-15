import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {shared} from '@supernote-tools/ui-kit';
import {defaultSettings} from '@supernote-tools/ink-core';
import {copy} from './src/copy';
import {PairsForm} from './src/PairsForm';

/**
 * Lingo's Settings view: the language-pair switches (#126), every size and colour from the shared
 * ui-kit (#93). The lasso flow lands with its own issue (#128).
 */
export default function App() {
  // shortcut: the settings live in memory and reset when Lingo restarts, as Bridge's do; upgrade
  // when the plugin storage lands (#40).
  const [settings, setSettings] = useState(defaultSettings);
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <PairsForm settings={settings} onChange={setSettings} />
    </View>
  );
}
