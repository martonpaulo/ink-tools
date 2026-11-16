import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {shared} from '@supernote-tools/ui-kit';
import {closePluginView} from '@supernote-tools/sn-adapter/official';
import {copy} from './src/copy';
import {EditsForm} from './src/EditsForm';
import {currentSettings, rememberSettings} from './src/edits';
import {
  closeStyles,
  GridState,
  gridState,
  onGridState,
  pickStyle,
  toggleOption,
} from './src/styles';
import {StylesGrid} from './src/StylesGrid';
import {syncButtons} from './src/buttons';
import {askFilePermissions} from './src/permissions';

/**
 * Retouch's Settings view: one switch per edit (#136), every size and colour from the shared
 * ui-kit (#93). Each switch also registers or removes its lasso button.
 */
export default function App() {
  const [settings, setSettings] = useState(currentSettings());
  const [grid, setGrid] = useState<GridState>(gridState());
  useEffect(() => onGridState(setGrid), []);
  useEffect(() => {
    askFilePermissions();
  }, []);
  if (grid.phase !== 'idle') {
    const close = () => closePluginView();
    return (
      <StylesGrid
        state={grid}
        onPick={style => pickStyle(style, close)}
        onToggle={option => toggleOption(option)}
        onClose={() => closeStyles(close)}
      />
    );
  }
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <EditsForm
        settings={settings}
        onChange={next => {
          setSettings(next);
          rememberSettings(next);
          syncButtons(next);
        }}
      />
    </View>
  );
}
