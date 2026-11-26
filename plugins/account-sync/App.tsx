import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  closePluginView,
  getPluginDirPath,
} from '@ink-tools/sn-adapter/official';
import {useBackKey} from '@ink-tools/ui-kit';
import {
  BridgeSettings,
  MODULE_PROVIDERS,
  MODULES,
} from '@ink-tools/sync-core/settings';
import {
  ModuleRun,
  moduleStatus,
  ProbeProblems,
} from '@ink-tools/sync-core/status';
import type {ModuleId} from '@ink-tools/sync-core/settings';
import {
  SECRET_PROVIDERS,
  SecretProvider,
  SecretStore,
  SignIn,
  signInState,
} from '@ink-tools/sync-core/secrets';
import {copy, format} from './src/copy';
import {SettingsForm} from './src/SettingsForm';
import {ModuleRow, SettingsShell, ShellState} from './src/SettingsShell';
import {createSecretStore} from './src/secretStore';
import {Folder, loadSettings, saveSettings} from './src/settingsStore';
import {bridgeSync, useSync} from './src/service';
import type {SyncRunner} from './src/sync';

/** The providers of a module that sign in with a secret (#90): ICS takes only a URL. */
const signInProviders = (id: ModuleId): SecretProvider[] =>
  SECRET_PROVIDERS.filter(p => (MODULE_PROVIDERS[id] as string[]).includes(p));

export type SignIns = Partial<Record<SecretProvider, SignIn>>;

/**
 * Each module's status from the settings and the device probe (#88, #43): a module the probe has not
 * cleared is blocked with its reasons, one it cleared shows its last run since the plugin host
 * started, or waits for its first (#28, #44), and one that is off says so. Never a schedule (#39).
 * Under a module that is on, each of its providers that signs in with a secret says whether it is
 * connected, with a sign-out, or offers «Connect» (#116; owner, 2026-11-26: every connection is off
 * until the person connects it); one whose sign-in was not read yet shows nothing.
 */
export function moduleRows(
  settings: BridgeSettings,
  probe: ProbeProblems = {},
  runs: Partial<Record<ModuleId, ModuleRun>> = {},
  signIns: SignIns = {},
  onSignOut: (provider: SecretProvider) => void = () => {},
): ModuleRow[] {
  return MODULES.map(id => ({
    id,
    name: copy[`module.${id}`],
    status: moduleStatus(id, settings, probe, runs),
    signIns: signInProviders(id).flatMap(p => {
      const signIn = signIns[p];
      return settings.modules[id] && signIn
        ? [
            {
              id: p,
              name: copy[`provider.${p as 'todoist' | 'google' | 'icloud'}`],
              signIn,
              onSignOut: () => onSignOut(p),
            },
          ]
        : [];
    }),
  }));
}

/**
 * Bridge's Settings view: the saved switches, loaded from and saved to the private folder (#40).
 * «Close» and Back close it, and do nothing while a pass runs (#204, #266). It shows the probe answer of the
 * runner's last pass and never probes itself: the probe runs only for a sync that needs it, and
 * only for the modules that are on (#43).
 */
export default function App({
  folder = getPluginDirPath,
  sync = bridgeSync,
  close = () => closePluginView(),
  secrets,
  log = console.log,
}: {
  folder?: Folder;
  /** The sign-in secrets in the private folder (#116); tests pass a fake. */
  secrets?: SecretStore;
  /** Where a failure's details go; the screen shows one sentence. */
  log?: (line: string) => void;
  /** The runner behind «Sync now»: the plugin host's one, which also runs the automatic pass. */
  sync?: SyncRunner;
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
}) {
  const synced = useSync(sync);
  const exit = () => {
    if (!synced.running) {
      close();
    }
  };
  useBackKey(exit);
  const [settings, setSettings] = useState<BridgeSettings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const store = useMemo(
    () => secrets ?? createSecretStore(folder),
    [secrets, folder],
  );
  const [signIns, setSignIns] = useState<SignIns>({});

  const readSignIns = useCallback(async () => {
    const read: SignIns = {};
    for (const provider of MODULES.flatMap(signInProviders)) {
      read[provider] = await signInState(store, provider);
    }
    setSignIns(read);
  }, [store]);

  // A pass moves a sign-in dropped by `inkctl secret set` in, so read them again after each one.
  useEffect(() => {
    readSignIns();
  }, [readSignIns, synced.runs]);

  const signOut = async (provider: SecretProvider) => {
    try {
      await store.remove(provider);
    } catch (e) {
      log(`[Bridge] sign-out: ${provider}: ${(e as Error).message}`);
      setSaveProblem(
        format('signOut.problem', {provider: copy[`provider.${provider as 'todoist'}`]}),
      );
    }
    await readSignIns();
  };

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
      onClose={exit}
      renderForm={
        settings
          ? onConnect => (
              <SettingsForm
                settings={settings}
                onChange={change}
                modules={moduleRows(settings, synced.probe, synced.runs, signIns, signOut)}
                onConnect={onConnect}
              />
            )
          : undefined
      }
    />
  );
}
