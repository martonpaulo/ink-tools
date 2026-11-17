import React, {useCallback, useEffect, useState} from 'react';
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
import {Folder, loadSettings, saveSettings} from './src/settingsStore';
import {bridgeSync, useSync} from './src/service';
import type {SyncRunner} from './src/sync';

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
 * Bridge's Settings view: the saved switches, loaded from and saved to the private folder (#40).
 * Back closes it, and does nothing while a pass runs (#204). It shows the probe answer of the
 * runner's last pass and never probes itself: the probe runs only for a sync that needs it, and
 * only for the modules that are on (#43).
 */
export default function App({
  folder = getPluginDirPath,
  sync = bridgeSync,
  close = () => closePluginView(),
}: {
  folder?: Folder;
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
        modules: moduleRows(settings, synced.probe, synced.runs),
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
