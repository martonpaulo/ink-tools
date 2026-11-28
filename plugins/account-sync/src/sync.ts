/**
 * What runs a sync on the tablet (#28, #44): the Settings view's «Sync now» (#40) and the automatic
 * pass, one at PluginHost start and one every `AUTO_SYNC_MINUTES` while the host lives, on the
 * timers `index.js` passes (the native ones, #283). Before
 * this, no code on the tablet called `runBridgeSync`. This file binds sync-core's runner to the
 * device: the saved Settings, the sign-in files (#90), the device probe (#43) and the Calendar and
 * To-Do stores over the content providers. It keeps the state between passes and the runs Settings
 * shows (#88), in memory: «last synced» is the last run since the plugin host started (#39).
 */
import {
  ACCOUNT_PROVIDERS,
  AccountProvider,
  activePlan,
  basicCredentials,
  BridgeModules,
  BridgeSettings,
  BridgeState,
  CalendarSource,
  createCalDavProvider,
  createCalDavWriter,
  createGoogleCalendarProvider,
  createGoogleCalendarWriter,
  createIcsProvider,
  createTodoistProvider,
  discoverCalDavCalendars,
  fetchGoogleAccount,
  fetchTodoistAccount,
  HttpFetch,
  httpsUrl,
  ICLOUD_CALDAV_ROOT,
  icsFeedName,
  initialBridgeState,
  ModuleAvailability,
  ModuleId,
  ModuleRun,
  OAuthClient,
  parseICloudSignIn,
  ProbeProblems,
  ProviderId,
  refreshAccessToken,
  removeCalendarRows,
  removeImportedTasks,
  runBridgeSync,
  SecretStore,
  setAccount,
  setIcsNames,
  TimeWindow,
  TwoWayModule,
} from '@ink-tools/sync-core';
import type {CleanupResult} from '@ink-tools/sync-core';
import type {Capability, CapabilityStatus} from '@ink-tools/sn-adapter';
import type {DeviceStores} from './deviceStores';
import type {SecretDrop} from './secretStore';
import {capabilitiesOf, probeDetails, probeProblems} from './probe';
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
  /** A new, unique UID for an event made on the tablet and sent to iCloud (#30); tests fix it. */
  newUid?: () => string;
}

/** A UID for an iCloud event made on the tablet: the time and a random part, never a person's data. */
const randomUid = (now: number) =>
  `${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}@ink-tools`;

/** A source that is on but cannot read: its pass fails with the reason, never an empty calendar. */
const failing = (id: ProviderId, reason: string): CalendarSource => ({
  id,
  provider: {
    listCalendars: () => Promise.reject(new Error(reason)),
    listEvents: () => Promise.reject(new Error(reason)),
  },
});

/** A provider with no sign-in names the tablet screen that connects it, never a command (#487). */
const SIGNED_OUT = "not connected: connect it in Account Sync's Settings";

/**
 * What a pass learns of the accounts it signs in to (#433): a reader per service, run after the
 * sync, and each ICS feed's calendar name by its address as Settings keeps it. Never logged.
 */
export interface AccountReads {
  readers: Partial<Record<AccountProvider, () => Promise<string>>>;
  ics: Record<string, string>;
}

export const noAccountReads = (): AccountReads => ({readers: {}, ics: {}});

async function googleSource(device: SyncDevice, accounts: AccountReads): Promise<CalendarSource> {
  const refresh = await device.secrets.read('google');
  if (refresh === null) {
    return failing('google', SIGNED_OUT);
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
    // The client comes only from the developer route, `inkctl secret set google-client` (#200).
    return failing('google', 'the Google sign-in client is not on the tablet');
  }
  // One access token per pass: each request asks for it, and it lasts an hour.
  let pending: Promise<string> | undefined;
  const access = () =>
    (pending ??= refreshAccessToken(device.fetch, client, refresh));
  accounts.readers.google = () => fetchGoogleAccount(device.fetch, access);
  return {
    id: 'google',
    provider: createGoogleCalendarProvider(device.fetch, access),
    writer: createGoogleCalendarWriter(device.fetch, access),
  };
}

/** Where a provider's notes go, such as a time zone read as UTC (#61). */
const warnTo = (device: SyncDevice, id: ProviderId) => (warnings: string[]) =>
  warnings.forEach(w => (device.log ?? console.log)(`[Bridge] ${id}: ${w}`));

/**
 * iCloud over CalDAV (#30): the sign-in `inkctl secret set icloud` sent, the owner's calendars found
 * by discovery once per pass, and the CalDAV writer, so the push of tablet edits reaches iCloud.
 */
async function icloudSource(device: SyncDevice): Promise<CalendarSource> {
  const raw = await device.secrets.read('icloud');
  if (raw === null) {
    return failing('icloud', SIGNED_OUT);
  }
  const {appleId, password} = parseICloudSignIn(raw);
  const signIn = {
    username: appleId,
    getPassword: async () => password,
    basicAuth: basicCredentials,
  };
  let calendars;
  try {
    calendars = await discoverCalDavCalendars({
      ...signIn,
      fetch: device.fetch,
      root: ICLOUD_CALDAV_ROOT,
    });
  } catch (e) {
    return failing('icloud', `the iCloud calendars did not read: ${(e as Error).message}`);
  }
  return {
    id: 'icloud',
    provider: createCalDavProvider({
      ...signIn,
      fetch: device.fetch,
      calendars,
      onWarnings: warnTo(device, 'icloud'),
    }),
    writer: createCalDavWriter({
      ...signIn,
      fetch: device.fetch,
      calendars,
      newUid: () => (device.newUid ?? (() => randomUid(device.now())))(),
      now: device.now,
    }),
  };
}

/**
 * The ICS feeds in Settings (#30), one read-only calendar each: no writer, so a tablet edit to one
 * is reported, never sent. A feed's id is its HTTPS address, unique across sources; its name holds
 * only the host, as a private feed's path is a secret.
 */
function icsSource(device: SyncDevice, feeds: string[], accounts: AccountReads): CalendarSource {
  if (!feeds.length) {
    return failing('ics', 'no ICS feed address in Settings');
  }
  const named = feeds.map((url, i) => {
    const https = httpsUrl(url);
    return {id: https, url: https, name: icsFeedName(https, i), address: url};
  });
  const onName = (id: string, name: string) => {
    const feed = named.find(f => f.id === id);
    if (feed) {
      accounts.ics[feed.address] = name;
    }
  };
  const fetchText = async (url: string) => {
    const res = await device.fetch(url, {method: 'GET', headers: {Accept: 'text/calendar'}});
    if (!res.ok) {
      throw new Error(`the feed answered HTTP ${res.status}`);
    }
    return res.text();
  };
  return {
    id: 'ics',
    provider: createIcsProvider(fetchText, named, warnTo(device, 'ics'), onName),
  };
}

/**
 * The modules of one pass, with only the providers the plan turned on. A provider whose sign-in
 * read fails, or that is not built for the tablet yet, is a failing source, so its error shows.
 */
export async function buildModules(
  device: SyncDevice,
  providers: ProviderId[],
  icsFeeds: string[] = [],
  defaultCalendarId?: string,
  accounts: AccountReads = noAccountReads(),
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
        sources.push(await googleSource(device, accounts));
      } else if (id === 'icloud') {
        sources.push(await icloudSource(device));
      } else if (id === 'ics') {
        sources.push(icsSource(device, icsFeeds, accounts));
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
      // Settings' calendar for new tablet events (#29); absent, such an event is only reported.
      defaultCalendarId,
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
      if (token !== null) {
        const options = {token, fetch: device.fetch};
        accounts.readers.todoist = () => fetchTodoistAccount(options);
      }
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
  /** Only this module, when it is on: inkctl's `sync --module` (#283). */
  only?: ModuleId;
}

/** The settings with every module but `only` turned off, for a pass of that module alone (#283). */
export function onlyModule(settings: BridgeSettings, only: ModuleId): BridgeSettings {
  const modules = Object.fromEntries(
    Object.entries(settings.modules).map(([id, on]) => [id, on && id === only]),
  ) as Record<ModuleId, boolean>;
  return {...settings, modules};
}

export interface SyncRunner {
  /** One pass; a press while one runs joins it instead of starting a second. */
  syncNow(options?: PassOptions): Promise<SyncSnapshot>;
  /**
   * «Remove what Account Sync wrote» for a module that is off (#89, #423): the Calendar rows or the
   * To-Do tasks it wrote, never the person's own. It waits for a pass that runs, and a pass pressed
   * meanwhile waits for it, so no pass reads a half-removed module.
   */
  removeWritten(module: TwoWayModule): Promise<CleanupResult>;
  snapshot(): SyncSnapshot;
  subscribe(listener: (s: SyncSnapshot) => void): () => void;
}

const availability = (statuses: CapabilityStatus[]): ModuleAvailability =>
  Object.fromEntries(
    statuses.map(s => [
      s.capability,
      {available: s.available, canWrite: s.canWrite},
    ]),
  );

/**
 * Keep what a pass learned in Settings, re-read first so no switch is lost: each module's first-link
 * time, once, and the account each service is signed in to (#433). An account read that fails keeps
 * the name an earlier pass read, and the log says why, without the name; a service whose sign-in was
 * just moved in forgets the old name first, so a row never names the account signed out of.
 */
async function keepSettings(
  device: SyncDevice,
  state: BridgeState,
  accounts: AccountReads,
  movedIn: string[],
  log: (line: string) => void,
): Promise<void> {
  if (!device.saveSettings) {
    return;
  }
  const names: Partial<Record<AccountProvider, string>> = {};
  for (const [id, read] of Object.entries(accounts.readers) as [AccountProvider, () => Promise<string>][]) {
    try {
      names[id] = await read();
    } catch (e) {
      log(`[Bridge] account: ${id}: not read, so its row says Connected: ${(e as Error).message}`);
    }
  }
  const fresh = await device.loadSettings();
  if (!fresh.ok) {
    return;
  }
  let next: BridgeSettings = {
    ...fresh.value,
    firstLinked: {...state.firstLinked, ...fresh.value.firstLinked},
  };
  for (const id of ACCOUNT_PROVIDERS) {
    if (names[id] !== undefined) {
      next = setAccount(next, id, names[id]);
    } else if (movedIn.includes(id)) {
      next = setAccount(next, id, undefined);
    }
  }
  next = setIcsNames(next, accounts.ics);
  if (JSON.stringify(next) === JSON.stringify(fresh.value)) {
    return;
  }
  const saved = await device.saveSettings(next);
  if (!saved.ok) {
    log(`[Bridge] sync: the settings were not saved: ${saved.message}`);
  }
}

export function createSyncRunner(device: SyncDevice): SyncRunner {
  const log = device.log ?? console.log;
  let state: BridgeState = initialBridgeState();
  let current: SyncSnapshot = {running: false, runs: {}, probe: {}};
  let pass: Promise<SyncSnapshot> | null = null;
  /** True while `pass` holds a removal, not a sync pass. */
  let removing = false;
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

  const run = async ({load = false, only}: PassOptions): Promise<SyncSnapshot> => {
    publish({...current, running: true});
    const movedIn: string[] = [];
    if (device.importSecrets) {
      try {
        for (const drop of await device.importSecrets()) {
          if (drop.moved) {
            movedIn.push(drop.provider);
          }
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
    const loaded = await device.loadSettings();
    if (!loaded.ok) {
      log(
        `[Bridge] sync: not run: the settings did not load: ${loaded.message}`,
      );
      return {...current, running: false, problem: loaded.message};
    }
    const settings = only ? {...loaded, value: onlyModule(loaded.value, only)} : loaded;
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
    // The log keeps the probe's details; the status shows only its sentences (#417).
    const details = probeDetails(statuses);
    for (const id of load ? [] : plan.blocked) {
      logBlocked(
        id,
        details[id]?.length ? details[id]! : ['the device check has not answered'],
        log,
      );
    }
    const runs = {...current.runs};
    if (plan.modules.length) {
      const accounts = noAccountReads();
      const modules = await buildModules(
        device,
        plan.providers,
        settings.value.icsFeeds,
        settings.value.defaultCalendarId,
        accounts,
      );
      const done = await runBridgeSync(plan, modules, state, device.now);
      state = done.state;
      await keepSettings(device, state, accounts, movedIn, log);
      for (const [id, r] of Object.entries(done.runs) as [
        ModuleId,
        ModuleRun,
      ][]) {
        runs[id] = r;
        logRun(r, log);
      }
    } else if (movedIn.length) {
      // A sign-in moved in on a pass that runs no module (the load pass, or every module blocked):
      // forget the replaced account's name now, so its row never names the account signed out of.
      await keepSettings(device, state, noAccountReads(), movedIn, log);
    }
    return {running: false, runs, probe};
  };

  /**
   * After a removal the next pass must not read the removed rows as the person's edits: a Calendar
   * row is removed by cancelling it, which the push would send to the service as a delete. So the
   * Calendar's sync time moves past the removal and its baseline empties; the To-Do keeps only the
   * links of the tasks that stay. shortcut: an edit on a row the removal did not take, such as a
   * tablet-made row with no link yet, is older than the new sync time and is not sent; upgrade by
   * keeping each removed row's key out of the push instead, if a device round shows such rows.
   */
  const remove = async (module: TwoWayModule): Promise<CleanupResult> => {
    const stores = device.stores;
    if (!stores) {
      return {removed: 0, errors: ['the Calendar and To-Do are not reachable in this build']};
    }
    if (module === 'calendar') {
      const result = await removeCalendarRows(stores.calendar);
      state = {...state, calendar: {lastSync: device.now(), baseline: []}};
      return result;
    }
    const {links, ...result} = await removeImportedTasks(stores.tasks, state.links);
    state = {...state, links};
    return result;
  };

  const runner: SyncRunner = {
    removeWritten(module) {
      const removal = (pass ?? Promise.resolve(current)).then(() => {
        removing = true;
        publish({...current, running: true});
        return remove(module).catch(
          (e): CleanupResult => ({removed: 0, errors: [(e as Error).message]}),
        );
      });
      const done = removal.then(result => {
        log(`[Bridge] remove ${module}: ${result.removed} removed${result.errors.map(e => `; ${e}`).join('')}`);
        return result;
      });
      // A pass pressed during the removal joins this promise, then sees the state it left.
      const mine: Promise<SyncSnapshot> = done.then(() => {
        removing = false;
        if (pass === mine) {
          pass = null;
        }
        const next = {...current, running: false};
        publish(next);
        return next;
      });
      pass = mine;
      return done;
    },
    syncNow(options = {}) {
      // A pass asked for during a removal runs after it, never in its place (#423).
      if (pass && removing) {
        return pass.then(() => runner.syncNow(options));
      }
      if (pass) {
        return pass;
      }
      const mine: Promise<SyncSnapshot> = run(options)
        .catch(e => ({
          ...current,
          running: false,
          problem: (e as Error).message,
        }))
        .then(next => {
          // A removal queued behind this pass holds the slot now; only this pass's own is cleared.
          if (pass === mine) {
            pass = null;
          }
          publish(next);
          return next;
        });
      pass = mine;
      return pass;
    },
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return runner;
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
