import React, {useCallback, useEffect, useState} from 'react';
import {BUNDLED_DESCRIPTOR, DeviceReader, probeAll} from '@supernote-tools/sn-adapter';
import {getPluginDirPath} from '@supernote-tools/sn-adapter/official';
import {BridgeSettings, MODULES} from '@supernote-tools/sync-core/settings';
import {moduleStatus, ProbeProblems} from '@supernote-tools/sync-core/status';
import {copy, format} from './src/copy';
import {SettingsForm} from './src/SettingsForm';
import {ModuleRow, SettingsShell, ShellState} from './src/SettingsShell';
import {deviceReader} from './src/deviceReader';
import {probeProblems} from './src/probe';
import {Folder, loadSettings, saveSettings} from './src/settingsStore';

/** One reader for the life of the plugin, so the probe effect runs once per open of Settings. */
const DEVICE_READER = deviceReader();

/**
 * Each module's status from the settings and the device probe (#88, #43): a module the probe has not
 * cleared is blocked with its reasons, one it cleared waits for the sync runner, which is not wired
 * yet, and one that is off says so. Never a schedule (#39).
 */
export function moduleRows(
  settings: BridgeSettings,
  probe: ProbeProblems = {},
): ModuleRow[] {
  return MODULES.map(id => ({
    id,
    name: copy[`module.${id}`],
    status: moduleStatus(id, settings, probe, {}),
  }));
}

/**
 * The start-up probe (#43, #67): sn-adapter's adapt-on/off check against the device, once per open
 * of Settings. A probe that throws blocks every module with its reason, never a silent pass.
 */
export async function startupProbe(reader: DeviceReader): Promise<ProbeProblems> {
  try {
    return probeProblems(await probeAll(BUNDLED_DESCRIPTOR, reader));
  } catch (error) {
    const reason = `the device check failed: ${error instanceof Error ? error.message : String(error)}`;
    return Object.fromEntries(MODULES.map(id => [id, [reason]]));
  }
}

/** Bridge's Settings view: the saved switches, loaded from and saved to the private folder (#40). */
export default function App({
  folder = getPluginDirPath,
  reader = DEVICE_READER,
}: {
  folder?: Folder;
  reader?: DeviceReader;
}) {
  const [probe, setProbe] = useState<ProbeProblems>({});
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

  useEffect(() => {
    let current = true;
    startupProbe(reader).then(problems => {
      if (current) {
        setProbe(problems);
      }
    });
    return () => {
      current = false;
    };
  }, [reader]);

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
        modules: moduleRows(settings, probe),
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
