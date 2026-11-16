/**
 * Retouch's Settings switches (#136): one toggle per edit in `EDITS` and one per style of the
 * Styles grid (#133), the ui-kit Button with `selected` for on, as Lingo's pair switches are (#126).
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {EDITS, RetouchSettings, setEdit, setStyle, STYLES} from './edits';
import {copy} from './copy';

export type EditsFormProps = {
  settings: RetouchSettings;
  onChange: (next: RetouchSettings) => void;
};

export function EditsForm({
  settings,
  onChange,
}: EditsFormProps): React.JSX.Element {
  return (
    <View style={shared.listRow}>
      <Text accessibilityRole="header" style={shared.heading}>
        {copy['settings.edits']}
      </Text>
      <View style={shared.row}>
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
      <View style={shared.row}>
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
    </View>
  );
}
