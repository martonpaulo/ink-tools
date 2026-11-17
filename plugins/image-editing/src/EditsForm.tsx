/**
 * Retouch's Settings switches (#136): one toggle per edit in `EDITS` and one per style of the
 * Styles grid (#133), the ui-kit Button with `selected` for on, as Lingo's pair switches are (#126),
 * and the debug switch that saves each edit's input (#134), off by default.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@ink-tools/ui-kit';
import {EDITS, RetouchSettings, setEdit, setStyle, STYLES} from './edits';
import {copy} from './copy';
import {setDebug} from './debug';
import {DEVICE} from './edit';

export type EditsFormProps = {
  settings: RetouchSettings;
  onChange: (next: RetouchSettings) => void;
  /** The native side of the debug switch (#134); the device's by default. */
  debugDeps?: Pick<typeof DEVICE, 'native' | 'log'>;
};

export function EditsForm({
  settings,
  onChange,
  debugDeps = DEVICE,
}: EditsFormProps): React.JSX.Element {
  const toggleDebug = async () =>
    onChange(await setDebug(settings, !settings.debug, debugDeps.native, debugDeps.log));
  return (
    <View style={shared.listRow}>
      <Text accessibilityRole="header" style={shared.heading}>
        {copy['settings.edits']}
      </Text>
      <View style={shared.buttons}>
        {EDITS.map(edit => {
          const on = settings.edits[edit.id];
          return (
            <Button
              key={edit.id}
              label={edit.name}
              selected={on}
              onPress={() => onChange(setEdit(settings, edit.id, !on))}
            />
          );
        })}
      </View>
      <Text accessibilityRole="header" style={shared.heading}>
        {copy['settings.styles']}
      </Text>
      <View style={shared.buttons}>
        {STYLES.map(style => {
          const on = settings.styles[style.id];
          return (
            <Button
              key={style.id}
              label={style.name}
              selected={on}
              onPress={() => onChange(setStyle(settings, style.id, !on))}
            />
          );
        })}
      </View>
      <Text accessibilityRole="header" style={shared.heading}>
        {copy['settings.debug']}
      </Text>
      <Button
        label={copy['settings.debugSave']}
        selected={settings.debug}
        onPress={toggleDebug}
      />
    </View>
  );
}
