import React from 'react';
import {SettingsShell} from './src/SettingsShell';

/** Bridge's Settings view. No module has landed yet, so it shows the empty state (#40, #93). */
export default function App() {
  return <SettingsShell state={{kind: 'ready', modules: []}} />;
}
