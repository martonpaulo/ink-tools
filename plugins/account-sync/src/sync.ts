/**
 * What runs a sync on the tablet (#28, #44): the Settings view's «Sync now» (#40) and the automatic
 * pass, one at PluginHost start and one every `AUTO_SYNC_MINUTES` while the host lives. Before
 * this, no code on the tablet called `runBridgeSync`. This file binds sync-core's runner to the
 * device: the saved Settings, the sign-in files (#90), the device probe (#43) and the Calendar and
 * To-Do stores over the content providers. It keeps the state between passes and the runs Settings
 * shows (#88), in memory: «last synced» is the last run since the plugin host started (#39).
 */
import {
  activePlan,
  BridgeModules,
  BridgeSettings,
  BridgeState,
  CalendarSource,
  createGoogleCalendarProvider,
  createGoogleCalendarWriter,
  createTodoistProvider,
  HttpFetch,
  initialBridgeState,
  ModuleAvailability,
  ModuleId,
  ModuleRun,
  OAuthClient,
  ProbeProblems,
  ProviderId,
  refreshAccessToken,
  runBridgeSync,
  SecretStore,
  tabletOnlyKept,
  TimeWindow,
  TWO_WAY_MODULES,
} from '@ink-tools/sync-core';
import type {Capability, CapabilityStatus} from '@ink-tools/sn-adapter';
import type {DeviceStores} from './deviceStores';
import type {SecretDrop} from './secretStore';
import {capabilitiesOf, probeProblems} from './probe';
import {logBlocked, logRun} from './statusText';

/** The automatic pass while the plugin host lives; a guess until a device round measures the cost. */
export const AUTO_SYNC_MINUTES = 30;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
/** The calendar window: the days before and after today that Bridge keeps in the native Calendar. */
export const WINDOW_DAYS_BEFORE = 7;
export const WINDOW_DAYS_AFTER = 60;

export function calendarWindow(now: number): TimeWindow {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  return {
    from: start - WINDOW_DAYS_BEFORE * DAY,
    to: start + WINDOW_DAYS_AFTER * DAY,
  };
}

type Fetch = HttpFetch<{json(): Promise<unknown>; text(): Promise<string>}>;

export interface SyncDevice {
  loadSettings(): Promise<
    {ok: true; value: BridgeSettings} | {ok: false; message: string}
  >;
  /** Keeps each module's first-link time in Settings (`firstLinked`); absent, it is not kept. */
  saveSettings?(settings: BridgeSettings): Promise<{ok: boolean; message?: string}>;
  secrets: SecretStore;
  /**
   * The Calendar and To-Do over the content providers (`createDeviceStores`); absent until the
   * native writer is in the build. Passed in, so the bundle holds sn-adapter's internals only once
   * that writer binds them.
   */
  stores?: DeviceStores;
  /**
   * The adapt-on/off probe (#43) of the capabilities given, only those of modules that are on;
   * absent until its device reader is in the build.
   */
  probe?: (capabilities: Capability[]) => Promise<CapabilityStatus[]>;
  /**
   * Moves the sign-in drop files `inkctl secret set` left into the private folder (#116,
   * `importSecretDrops`); each pass runs it first, so a start and «Sync now» both take them.
   */
  importSecrets?: () => Promise<SecretDrop[]>;
  /** The Google OAuth client the refresh needs (#200); null when it is not on the tablet. */
  googleClient?: () => Promise<OAuthClient | null>;
  fetch: Fetch;
  now: () => number;
  log?: (line: string) => void;
}

/** A source that is on but cannot read: its pass fails with the reason, never an empty calendar. */
const failing = (id: ProviderId, reason: string): CalendarSource => ({
  id,
  provider: {
    listCalendars: () => Promise.reject(new Error(reason)),
    listEvents: () => Promise.reject(new Error(reason)),
  },
});

const signedOut = (id: string) =>
  `not signed in: on the Mac, run inkctl secret set ${id}`;

async function googleSource(device: SyncDevice): Promise<CalendarSource> {
  const refresh = await device.secrets.read('google');
  if (refresh === null) {
    return failing('google', signedOut('google'));
  }
  // The OAuth client is its own file, `inkctl secret set google-client` (#200); a missing or
  // broken one fails this source with the reason, never an empty calendar.
  let client: OAuthClient | null;
  try {
    client = (await device.googleClient?.()) ?? null;
  } catch (e) {
    return failing('google', `the Google sign-in client did not read: ${(e as Error).message}`);
  }
  if (!client) {
    return failing(
      'google',
      'the Google sign-in client is not on the tablet: on the Mac, run inkctl secret set google-client',
    );
  }
  // One access token per pass: each request asks for it, and it lasts an hour.
  let pending: Promise<string> | undefined;
  const access = () =>
    (pending ??= refreshAccessToken(device.fetch, client, refresh));
  return {
    id: 'google',
    provider: createGoogleCalendarProvider(device.fetch, access),
    writer: createGoogleCalendarWriter(device.fetch, access),
  };
}

/**
 * The modules of one pass, with only the providers the plan turned on. A provider whose sign-in
 * read fails, or that is not built for the tablet yet, is a failing source, so its error shows.
 */
export async function buildModules(
  device: SyncDevice,
  providers: ProviderId[],
): Promise<BridgeModules> {
  const modules: BridgeModules = {};
  // Without the content providers the probe cannot have passed, so no module is in the plan.
  const stores = device.stores;
  if (!stores) {
    return modules;
  }
  const sources: CalendarSource[] = [];
  for (const id of providers) {
    try {
      if (id === 'google') {
        sources.push(await googleSource(device));
      } else if (id === 'icloud' || id === 'ics') {
        sources.push(failing(id, 'not built for the tablet yet (#30)'));
      }
    } catch (e) {
      sources.push(
        failing(id, `the sign-in did not read: ${(e as Error).message}`),
      );
    }
  }
  if (sources.length) {
    modules.calendar = {
      sources,
      store: stores.calendar,
      window: calendarWindow(device.now()),
      // The writer's notes, such as the extra copies of an event it removed (#218).
      takeWarnings: () => stores.calendar.takeWarnings(),
    };
  }
  if (providers.includes('todoist')) {
    let token: string | null;
    let provider;
    try {
      token = await device.secrets.read('todoist');
      provider =
        token === null
          ? null
          : createTodoistProvider({token, fetch: device.fetch});
    } catch (e) {
      // A sign-in that does not read fails the to-do run with its reason, never «not signed in».
      const reason = `the sign-in did not read: ${(e as Error).message}`;
      const no = () => Promise.reject(new Error(reason));
      provider = {list: no, get: no, create: no, update: no, remove: no};
    }
    if (provider) {
      modules.todo = {
        provider,
        store: stores.tasks,
      };
    }
  }
  return modules;
}

export interface SyncSnapshot {
  running: boolean;
  runs: Partial<Record<ModuleId, ModuleRun>>;
  /** The probe's problems per module; empty until the probe answers. */
  probe: ProbeProblems;
  /** Why the last pass did not start, such as unreadable Settings. */
  problem?: string;
}

export interface PassOptions {
  /**
   * The pass when PluginHost loads Bridge: it moves the sign-in drops in and runs only modules an
   * earlier probe of this host cleared, which is none, as the host just started. It never probes:
   * every plugin install restarts the host, and the old insert probe left a Calendar row on each
   * start (#43). The probe runs at «Sync now» and at the automatic pass.
   */
  load?: boolean;
}

export interface SyncRunner {
  /** One pass; a press while one runs joins it instead of starting a second. */
  syncNow(options?: PassOptions): Promise<SyncSnapshot>;
  snapshot(): SyncSnapshot;
  /**
   * How many open tablet To-Do tasks with no link would stay on the tablet at the next pass, for
   * Settings to show before the first «Sync now»; null when the tablet cannot be read.
   */
  tabletOnlyTasks(settings: BridgeSettings): Promise<number | null>;
  subscribe(listener: (s: SyncSnapshot) => void): () => void;
}

const availability = (statuses: CapabilityStatus[]): ModuleAvailability =>
  Object.fromEntries(
    statuses.map(s => [
      s.capability,
      {available: s.available, canWrite: s.canWrite},
    ]),
  );

/** Record each module's first-link time in Settings once, re-read first so no switch is lost. */
async function keepFirstLinked(
  device: SyncDevice,
  state: BridgeState,
  log: (line: string) => void,
): Promise<void> {
  if (!device.saveSettings) {
    return;
  }
  const fresh = await device.loadSettings();
  if (!fresh.ok) {
    return;
  }
  const missing = TWO_WAY_MODULES.filter(
    m => state.firstLinked[m] !== undefined && fresh.value.firstLinked[m] === undefined,
  );
  if (!missing.length) {
    return;
  }
  const saved = await device.saveSettings({
    ...fresh.value,
    firstLinked: {...state.firstLinked, ...fresh.value.firstLinked},
  });
  if (!saved.ok) {
    log(`[Bridge] sync: the first-link time was not saved: ${saved.message}`);
  }
}

export function createSyncRunner(device: SyncDevice): SyncRunner {
  const log = device.log ?? console.log;
  let state: BridgeState = initialBridgeState();
  let current: SyncSnapshot = {running: false, runs: {}, probe: {}};
  let pass: Promise<SyncSnapshot> | null = null;
  /**
   * The capabilities the probe cleared since the host started; each is probed once, and one that
   * failed is probed again at the next pass that needs it.
   */
  const cleared = new Map<Capability, CapabilityStatus>();
  const listeners = new Set<(s: SyncSnapshot) => void>();
  const publish = (next: SyncSnapshot) => {
    current = next;
    listeners.forEach(l => l(current));
  };

  const run = async ({load = false}: PassOptions): Promise<SyncSnapshot> => {
    publish({...current, running: true});
    if (device.importSecrets) {
      try {
        for (const drop of await device.importSecrets()) {
          log(
            drop.moved
              ? `[Bridge] secrets: ${drop.provider} moved in from the drop folder`
              : `[Bridge] secrets: ${drop.provider} not moved in: ${drop.problem}`,
          );
        }
      } catch (e) {
        log(
          `[Bridge] secrets: the drop folder check failed: ${
            (e as Error).message
          }`,
        );
      }
    }
    const settings = await device.loadSettings();
    if (!settings.ok) {
      log(
        `[Bridge] sync: not run: the settings did not load: ${settings.message}`,
      );
      return {...current, running: false, problem: settings.message};
    }
    // Only the modules that are on are probed, and never in the load pass (#43).
    const wanted = capabilitiesOf(settings.value);
    const statuses: CapabilityStatus[] = wanted.flatMap(c => cleared.get(c) ?? []);
    const unknown = wanted.filter(c => !cleared.has(c));
    let probe: ProbeProblems = probeProblems(statuses);
    if (load && unknown.length) {
      log('[Bridge] sync: the load pass checks no device and writes nothing; the first check runs at «Sync now» or the automatic pass');
    } else if (device.probe && unknown.length) {
      try {
        for (const status of await device.probe(unknown)) {
          statuses.push(status);
          if (status.available && status.canWrite) {
            cleared.set(status.capability, status);
          }
        }
        probe = probeProblems(statuses);
      } catch (e) {
        log(`[Bridge] sync: the device check failed: ${(e as Error).message}`);
      }
    }
    const plan = activePlan(settings.value, availability(statuses));
    for (const id of load ? [] : plan.blocked) {
      logBlocked(
        id,
        probe[id]?.length ? probe[id]! : ['the device check has not answered'],
        log,
      );
    }
    const runs = {...current.runs};
    if (plan.modules.length) {
      const modules = await buildModules(device, plan.providers);
      const done = await runBridgeSync(plan, modules, state, device.now);
      state = done.state;
      await keepFirstLinked(device, state, log);
      for (const [id, r] of Object.entries(done.runs) as [
        ModuleId,
        ModuleRun,
      ][]) {
        runs[id] = r;
        logRun(r, log);
      }
    }
    return {running: false, runs, probe};
  };

  return {
    syncNow(options = {}) {
      pass ??= run(options)
        .catch(e => ({
          ...current,
          running: false,
          problem: (e as Error).message,
        }))
        .then(next => {
          pass = null;
          publish(next);
          return next;
        });
      return pass;
    },
    snapshot: () => current,
    async tabletOnlyTasks(settings) {
      if (!device.stores) {
        return null;
      }
      try {
        const tasks = await device.stores.tasks.list();
        return tabletOnlyKept(tasks, state.links, {
          firstLinked: state.firstLinked.todo,
          sendTabletOnly: settings.sendTabletOnly.todo,
        });
      } catch (e) {
        log(`[Bridge] sync: the To-Do did not read: ${(e as Error).message}`);
        return null;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/**
 * The automatic sync: the load pass now, which never probes (`PassOptions.load`), and one full pass
 * every `AUTO_SYNC_MINUTES`; returns the stop.
 */
export function startAutoSync(
  runner: SyncRunner,
  timers: Timers = {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: h => clearInterval(h as ReturnType<typeof setInterval>),
  },
): () => void {
  runner.syncNow({load: true});
  const handle = timers.setInterval(() => {
    runner.syncNow();
  }, AUTO_SYNC_MINUTES * MINUTE);
  return () => timers.clearInterval(handle);
}
