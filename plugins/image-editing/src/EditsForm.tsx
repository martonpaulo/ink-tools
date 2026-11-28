/**
 * Retouch's Settings switches (#136): one toggle per edit in `EDITS` and one per style of the
 * Styles grid (#133), each a ui-kit `SwitchRow` (#274) in its captioned `RowGroup` (#275), and the debug switch that saves each edit's input (#134), off by default.
 */
import React from 'react';
import {PagedColumn, RowGroup, SwitchRow} from '@ink-tools/ui-kit';
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
    onChange(
      await setDebug(
        settings,
        !settings.debug,
        debugDeps.native,
        debugDeps.log,
      ),
    );
  return (
    // Its groups page with the native pager, never scroll (#548).
    <PagedColumn>
      <RowGroup caption={copy['settings.edits']}>
        {EDITS.map(edit => (
          <SwitchRow
            key={edit.id}
            title={edit.name}
            value={settings.edits[edit.id]}
            onChange={on => onChange(setEdit(settings, edit.id, on))}
          />
        ))}
      </RowGroup>
      <RowGroup caption={copy['settings.styles']}>
        {STYLES.map(style => (
          <SwitchRow
            key={style.id}
            title={style.name}
            value={settings.styles[style.id]}
            onChange={on => onChange(setStyle(settings, style.id, on))}
          />
        ))}
      </RowGroup>
      <RowGroup caption={copy['settings.debug']}>
        <SwitchRow
          title={copy['settings.debugSave']}
          value={settings.debug}
          onChange={toggleDebug}
        />
      </RowGroup>
    </PagedColumn>
  );
}
