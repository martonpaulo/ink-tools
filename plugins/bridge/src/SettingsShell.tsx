/**
 * Bridge's Settings view: the title and the module list, with every size and colour from the
 * shared ui-kit (#93). The modules and their switches land with #40; this shell owns the states a
 * Settings screen needs: loading, an error with a retry, no module yet, and a module that is
 * unavailable with its reason in words, never by colour alone.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {copy, format} from './copy';

export type ModuleRow = {
  id: string;
  name: string;
  /** Why the module cannot run, such as the device probe turning it off (#67). */
  unavailable?: string;
};

export type ShellState =
  | {kind: 'loading'}
  | {kind: 'error'; reason: string; onRetry: () => void}
  | {kind: 'ready'; modules: ModuleRow[]};

export function SettingsShell({state}: {state: ShellState}): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <Body state={state} />
    </View>
  );
}

function Body({state}: {state: ShellState}): React.JSX.Element {
  switch (state.kind) {
    case 'loading':
      return <Text style={shared.text}>{copy['settings.loading']}</Text>;
    case 'error':
      return (
        <View style={shared.row}>
          <Text accessibilityRole="alert" style={shared.text}>
            {format('settings.error', {reason: state.reason})}
          </Text>
          <Button label={copy['settings.retry']} onPress={state.onRetry} />
        </View>
      );
    case 'ready':
      if (state.modules.length === 0) {
        return <Text style={shared.text}>{copy['settings.empty']}</Text>;
      }
      return (
        <View>
          {state.modules.map(module => (
            <View key={module.id} style={shared.listRow}>
              <Text style={shared.text}>{module.name}</Text>
              {module.unavailable !== undefined && (
                <Text style={shared.text}>
                  {format('module.unavailable', {reason: module.unavailable})}
                </Text>
              )}
            </View>
          ))}
        </View>
      );
  }
}
