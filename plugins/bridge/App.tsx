import React, {useState} from 'react';
import {defaultSettings} from '@supernote-tools/sync-core/settings';
import {SettingsForm} from './src/SettingsForm';
import {SettingsShell} from './src/SettingsShell';

/** Bridge's Settings view: no module runs yet, so the list is empty and only the switches show (#40). */
export default function App() {
  // shortcut: the settings live in memory and reset when Bridge restarts; upgrade when the device
  // storage lands with FILE:WRITE and a tablet round (#40, #83).
  const [settings, setSettings] = useState(defaultSettings);
  return (
    <SettingsShell
      state={{kind: 'ready', modules: []}}
      form={<SettingsForm settings={settings} onChange={setSettings} />}
    />
  );
}
