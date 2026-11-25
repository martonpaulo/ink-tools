/**
 * Retouch's Settings switches (#136): one toggle per edit in `EDITS` and one per style of the
 * Styles grid (#133), each a ui-kit `SwitchRow` (#274), and the debug switch that saves each edit's input (#134), off by default.
 */
import React from 'react';
import {View} from 'react-native';
import {SectionCaption, SwitchRow} from '@ink-tools/ui-kit';
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
    <View>
      <SectionCaption>{copy['settings.edits']}</SectionCaption>
      {EDITS.map(edit => (
        <SwitchRow
          key={edit.id}
          title={edit.name}
          value={settings.edits[edit.id]}
          onChange={on => onChange(setEdit(settings, edit.id, on))}
        />
      ))}
      <SectionCaption>{copy['settings.styles']}</SectionCaption>
      {STYLES.map(style => (
        <SwitchRow
          key={style.id}
          title={style.name}
          value={settings.styles[style.id]}
          onChange={on => onChange(setStyle(settings, style.id, on))}
        />
      ))}
      <SectionCaption>{copy['settings.debug']}</SectionCaption>
      <SwitchRow
        title={copy['settings.debugSave']}
        value={settings.debug}
        onChange={toggleDebug}
      />
    </View>
  );
}
