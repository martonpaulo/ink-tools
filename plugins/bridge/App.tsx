import React, {useCallback, useEffect, useState} from 'react';
import {getPluginDirPath} from '@supernote-tools/sn-adapter/official';
import {BridgeSettings, MODULES} from '@supernote-tools/sync-core/settings';
import {moduleStatus} from '@supernote-tools/sync-core/status';
import {copy, format} from './src/copy';
import {SettingsForm} from './src/SettingsForm';
import {ModuleRow, SettingsShell, ShellState} from './src/SettingsShell';
import {Folder, loadSettings, saveSettings} from './src/settingsStore';

/**
 * Each module's status from the settings (#88). No module runs on the tablet yet: the device probe
 * has not answered (#43, #67) and the sync runner is not wired, so a module that is on says why it
 * does not run, and one that is off says so. Never a schedule (#39).
 */
export function moduleRows(settings: BridgeSettings): ModuleRow[] {
  return MODULES.map(id => ({
    id,
    name: copy[`module.${id}`],
    status: moduleStatus(id, settings, {}, {}),
  }));
}

/** Bridge's Settings view: the saved switches, loaded from and saved to the private folder (#40). */
export default function App({folder = getPluginDirPath}: {folder?: Folder}) {
  const [settings, setSettings] = useState<BridgeSettings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    const loaded = await loadSettings(folder);
    if (loaded.ok) {
      setSettings(loaded.value);
    } else {
      setProblem(loaded.message);
    }
  }, [folder]);

  useEffect(() => {
    load();
  }, [load]);

  const change = async (next: BridgeSettings) => {
    setSettings(next);
    const saved = await saveSettings(folder, next);
    setSaveProblem(
      saved.ok ? null : format('settings.saveError', {reason: saved.message}),
    );
  };

  const state: ShellState = problem
    ? {kind: 'error', reason: problem, onRetry: load}
    : settings
    ? {
        kind: 'ready',
        modules: moduleRows(settings),
        notice: saveProblem ?? undefined,
      }
    : {kind: 'loading'};
  return (
    <SettingsShell
      state={state}
      form={settings && <SettingsForm settings={settings} onChange={change} />}
    />
  );
}
