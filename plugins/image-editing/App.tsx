import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {
  Button,
  shared,
  useBackKey,
  useWorking,
  WorkingStrip,
} from '@ink-tools/ui-kit';
import {closePluginView} from '@ink-tools/sn-adapter/official';
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
import {working} from './src/working';

/**
 * Retouch's Settings view: one switch per edit (#136), every size and colour from the shared
 * ui-kit (#93). Each switch also registers or removes its lasso button. While an edit runs past
 * 2 s, the view is the «Loading…» strip (#103). Back does what the open screen's «Close» does:
 * it closes the styles grid, or Settings, and does nothing while an edit runs (#204). Settings has
 * its own «Close» too: opened by the permission path, PluginHost kept the key from the view on
 * the Nomad, so Back never reached it (#204, measured on beta 7).
 */
export default function App({
  close = () => closePluginView(),
}: {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
}) {
  const [settings, setSettings] = useState(currentSettings());
  const [grid, setGrid] = useState<GridState>(gridState());
  useEffect(() => onGridState(setGrid), []);
  useEffect(() => {
    askFilePermissions();
  }, []);
  useBackKey(() => {
    if (working.isWorking()) {
      // The edit ends by itself, with its toast.
    } else if (grid.phase !== 'idle') {
      // «Making» is refused there too, as the grid's «Close» is disabled.
      closeStyles(close);
    } else {
      close();
    }
  });
  if (useWorking(working)) {
    return <WorkingStrip />;
  }
  if (grid.phase !== 'idle') {
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
      <View style={shared.actions}>
        <Button label={copy['settings.close']} onPress={close} />
      </View>
    </View>
  );
}
