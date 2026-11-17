import React, {useCallback, useEffect, useState} from 'react';
import {
  BUNDLED_DESCRIPTOR,
  DeviceReader,
  probeAll,
} from '@ink-tools/sn-adapter';
import {
  closePluginView,
  getPluginDirPath,
} from '@ink-tools/sn-adapter/official';
import {useBackKey} from '@ink-tools/ui-kit';
import {BridgeSettings, MODULES} from '@ink-tools/sync-core/settings';
import {
  ModuleRun,
  moduleStatus,
  ProbeProblems,
} from '@ink-tools/sync-core/status';
import type {ModuleId} from '@ink-tools/sync-core/settings';
import {copy, format} from './src/copy';
import {SettingsForm} from './src/SettingsForm';
import {ModuleRow, SettingsShell, ShellState} from './src/SettingsShell';
import {deviceReader} from './src/deviceReader';
import {probeProblems} from './src/probe';
import {Folder, loadSettings, saveSettings} from './src/settingsStore';
import {bridgeSync, useSync} from './src/service';
import type {SyncRunner} from './src/sync';

/** One reader for the life of the plugin, so the probe effect runs once per open of Settings. */
const DEVICE_READER = deviceReader();

/**
 * Each module's status from the settings and the device probe (#88, #43): a module the probe has not
 * cleared is blocked with its reasons, one it cleared shows its last run since the plugin host
 * started, or waits for its first (#28, #44), and one that is off says so. Never a schedule (#39).
 */
export function moduleRows(
  settings: BridgeSettings,
  probe: ProbeProblems = {},
  runs: Partial<Record<ModuleId, ModuleRun>> = {},
): ModuleRow[] {
  return MODULES.map(id => ({
    id,
    name: copy[`module.${id}`],
    status: moduleStatus(id, settings, probe, runs),
  }));
}

/**
 * The start-up probe (#43, #67): sn-adapter's adapt-on/off check against the device, once per open
 * of Settings. A probe that throws blocks every module with its reason, never a silent pass.
 */
export async function startupProbe(
  reader: DeviceReader,
): Promise<ProbeProblems> {
  try {
    return probeProblems(await probeAll(BUNDLED_DESCRIPTOR, reader));
  } catch (error) {
    const reason = `the device check failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return Object.fromEntries(MODULES.map(id => [id, [reason]]));
  }
}

/**
 * Bridge's Settings view: the saved switches, loaded from and saved to the private folder (#40).
 * Back closes it, and does nothing while a pass runs (#204).
 */
export default function App({
  folder = getPluginDirPath,
  reader = DEVICE_READER,
  sync = bridgeSync,
  close = () => closePluginView(),
}: {
  folder?: Folder;
  reader?: DeviceReader;
  /** The runner behind «Sync now»: the plugin host's one, which also runs the automatic pass. */
  sync?: SyncRunner;
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
}) {
  const synced = useSync(sync);
  useBackKey(() => {
    if (!synced.running) {
      close();
    }
  });
  const [probe, setProbe] = useState<ProbeProblems>({});
  const [settings, setSettings] = useState<BridgeSettings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const [tabletOnly, setTabletOnly] = useState<number | null>(null);

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

  // Before the first «Sync now», show how many tablet-only tasks would stay on the tablet.
  useEffect(() => {
    let current = true;
    if (settings?.modules.todo) {
      sync.tabletOnlyTasks(settings).then(n => {
        if (current) {
          setTabletOnly(n);
        }
      });
    }
    return () => {
      current = false;
    };
  }, [settings, sync, synced.runs]);

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
        modules: moduleRows(settings, probe, synced.runs),
        notice: saveProblem ?? undefined,
        sync: {
          running: synced.running,
          onSyncNow: () => {
            sync.syncNow();
          },
          problem: synced.problem,
        },
      }
    : {kind: 'loading'};
  return (
    <SettingsShell
      state={state}
      form={settings && (
          <SettingsForm
            settings={settings}
            onChange={change}
            tabletOnlyTasks={tabletOnly}
          />
        )}
    />
  );
}
