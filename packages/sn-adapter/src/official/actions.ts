/**
 * A plugin's own actions, run by a command from inkctl with no screen and no press (#283). Each
 * plugin passes the reader of its `action.json`, in a folder inkctl can write and the plugin can
 * read, and its table of actions; every ACTION_POLL_MS the channel reads the file, runs a request
 * whose id is new, and logs the answer under ReactNativeJS for inkctl to read:
 * `INKTOOLS action <plugin> <id> <n>/<count> <json>`. `cli/inkctl/src/inkctl` owns the other side.
 *
 * A request is `{"id": hex, "action": name, "args": {...}, "at": <the tablet's time in ms>}`. One
 * older than ACTION_MAX_AGE_MS, such as a file left from before a host restart, is answered
 * `stale` and never run. A JS timer does not fire while PluginHost shows none of the plugin's views
 * (device round 5, #283), so each plugin passes `nativeTimers`, which tick from the plugin's native
 * `TickModule` with no view open.
 *
 * A request comes in a run of several, as an Note Editor session or a device round sends
 * them: after each one the channel also reads the file every ACTION_BURST_POLL_MS, until
 * ACTION_BURST_MS pass with no new request. The idle read stays ACTION_POLL_MS, so an idle plugin
 * reads its file no more often than before; within a run, an edit no longer waits up to a whole
 * idle tick (1.2 s of a 3.1 to 4.1 s call on a 504-stroke page, device round 10, #314).
 */
import {NativeEventEmitter, NativeModules} from 'react-native';

/** The request file's name, in each plugin's own folder. */
export const ACTION_FILE = 'action.json';
/** Every answer line starts with this, then the plugin, the request id, the chunk and the count. */
export const ACTION_MARK = 'INKTOOLS action';
export const ACTION_POLL_MS = 1_200;
/** The read interval while a run of requests goes on, and how long a run lasts after its last request. */
export const ACTION_BURST_POLL_MS = ACTION_POLL_MS / 8;
export const ACTION_BURST_MS = 2 * 60_000;
export const ACTION_MAX_AGE_MS = 60_000;
/**
 * How long one action may hold the channel. PluginHost sends a plugin's call to the app that last
 * came to the front; with the Settings app there, `getCurrentFilePath` went to Settings, which has
 * no answer for it, and the call never returned. The channel stayed busy, so every later request,
 * the note in front again, went unanswered until PluginHost restarted [measured, Ink Tools Probe's
 * `run-probe`, Manta, 2026-11-27, #474]. Past this limit the channel answers the request as
 * unfinished and takes the next one; the call itself cannot be cancelled.
 */
export const ACTION_RUN_LIMIT_MS = 2 * ACTION_MAX_AGE_MS;
/** A logcat line holds about 4 KB with its prefix; a longer answer goes in chunks of this many characters. */
export const ACTION_CHUNK = 3200;
/** The answer codes inkctl maps to its exit codes. */
export const ACTION_FAILED = 1;
export const ACTION_REFUSED = 2;
export const ACTION_STALE = 7;

const ID_PATTERN = /^[0-9a-f]{8,64}$/;
/** The ids answered, kept so a request is never run twice; a plugin sends a few a round. */
const IDS_KEPT = 20;

/** What an action answers: its own result line, the one the plugin logs, and any detail. */
export type ActionResult = {line: string} & Record<string, unknown>;
export type Action = (args: Record<string, unknown>) => Promise<ActionResult>;

export interface ActionTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** The JS timers, which stop while no view of the plugin shows (#283). */
const jsTimers: ActionTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface ActionChannelOptions {
  /** The plugin's name in the answer lines, as inkctl names it: its folder name, such as `account-sync`. */
  plugin: string;
  /** The request file's text, or null or a throw when there is none. */
  read: () => Promise<string | null>;
  actions: Record<string, Action>;
  log?: (line: string) => void;
  now?: () => number;
  timers?: ActionTimers;
}

export interface ActionChannel {
  /** One read of the file: runs a new request, answers it, and ignores anything else. */
  check(): Promise<void>;
  stop(): void;
}

/**
 * A request the action refuses, such as a bad argument: answered with ACTION_REFUSED, not
 * ACTION_FAILED. `detail` joins the answer, such as a refusal's name and what the plugin saw (#312).
 */
export class ActionRefused extends Error {
  constructor(
    message: string,
    readonly code: number = ACTION_REFUSED,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** The logcat lines of one answer, in numbered chunks that join back to the JSON. */
export function actionLines(plugin: string, id: string, answer: object, size: number = ACTION_CHUNK): string[] {
  const text = JSON.stringify(answer);
  const count = Math.max(1, Math.ceil(text.length / size));
  return Array.from({length: count}, (_, index) => `${ACTION_MARK} ${plugin} ${id} ${index + 1}/${count} ${text.slice(index * size, (index + 1) * size)}`);
}

type Request = {id: string; action: string; args: Record<string, unknown>; at: number};

/** The request's id, or null when the text carries none, so a half-written file is read again. */
function requestId(text: string): string | null {
  try {
    const id = JSON.parse(text)?.id;
    return typeof id === 'string' && ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

function parseRequest(text: string, actions: Record<string, Action>): Request {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const {action, args = {}, at} = raw;
  if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(actions, action)) {
    throw new ActionRefused(`unknown action: ${String(action)}; this plugin runs ${Object.keys(actions).join(', ')}`);
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new ActionRefused('args must be an object');
  }
  if (typeof at !== 'number' || !Number.isFinite(at)) {
    throw new ActionRefused('at must be the tablet time in ms');
  }
  return {id: raw.id as string, action, args: args as Record<string, unknown>, at};
}

/** Starts the channel's timer; `check` is exposed for tests and for a read at once. Never throws. */
export function startActionChannel({
  plugin,
  read,
  actions,
  log = line => console.log(line),
  now = Date.now,
  timers = jsTimers,
}: ActionChannelOptions): ActionChannel {
  const answered: string[] = [];
  let busy = false;
  /** The running request and when it started; a run counter, so a late end of an abandoned one changes nothing. */
  let running = {id: '', since: 0, run: 0};
  let burst: unknown = null;
  let lastRequest = 0;

  /** Reads fast from now until ACTION_BURST_MS pass with no new request. */
  function hurry() {
    lastRequest = now();
    if (burst !== null) {
      return;
    }
    burst = timers.setInterval(() => {
      if (now() - lastRequest > ACTION_BURST_MS) {
        timers.clearInterval(burst);
        burst = null;
        return;
      }
      channel.check();
    }, ACTION_BURST_POLL_MS);
  }

  async function answer(text: string): Promise<object> {
    const started = now();
    try {
      const request = parseRequest(text, actions);
      if (started - request.at > ACTION_MAX_AGE_MS) {
        throw new ActionRefused(`stale: the request is ${Math.round((started - request.at) / 1000)} s old`, ACTION_STALE);
      }
      const result = await actions[request.action](request.args);
      return {ok: true, action: request.action, ms: now() - started, ...result};
    } catch (error) {
      const refused = error instanceof ActionRefused;
      const code = refused ? error.code : ACTION_FAILED;
      const detail = refused ? error.detail : {};
      return {...detail, ok: false, code, message: error instanceof Error ? error.message : String(error)};
    }
  }

  const channel: ActionChannel = {
    async check() {
      if (busy) {
        if (now() - running.since <= ACTION_RUN_LIMIT_MS) {
          return;
        }
        const message = `no end in ${Math.round(ACTION_RUN_LIMIT_MS / 1000)} s: a call the host never answered, such as one made while another app than the note was in front; the channel takes the next request`;
        actionLines(plugin, running.id, {ok: false, code: ACTION_FAILED, message}).forEach(log);
        busy = false;
      }
      busy = true;
      const run = running.run + 1;
      running = {id: '', since: now(), run};
      try {
        let text: string | null;
        try {
          text = await read();
        } catch {
          return; // no file yet, or one that cannot be read now: read again at the next tick
        }
        const id = text === null ? null : requestId(text);
        if (text === null || id === null || answered.includes(id)) {
          return;
        }
        answered.push(id);
        answered.splice(0, Math.max(0, answered.length - IDS_KEPT));
        hurry();
        running = {...running, id};
        const reply = await answer(text);
        if (running.run === run) {
          actionLines(plugin, id, reply).forEach(log);
        }
      } finally {
        if (running.run === run) {
          busy = false;
        }
      }
    },
    stop() {
      timers.clearInterval(handle);
      if (burst !== null) {
        timers.clearInterval(burst);
        burst = null;
      }
    },
  };
  const handle = timers.setInterval(() => {
    channel.check();
  }, ACTION_POLL_MS);
  return channel;
}

/** The calls of a plugin's native `TickModule` (sn-adapter `native/com/inktools/timer`). */
export type TickModule = {start(key: number, periodMs: number): void; stop(key: number): void};

/** Subscribes to an event of the module; answers the stop. */
export type TickSubscribe = (event: string, listener: (key: number) => void) => () => void;

/**
 * `setInterval` and `clearInterval` on the native timer the plugin registered as `name`, such as
 * `BridgeTicks` (#283, #370): its ticks reach JavaScript with no plugin view open, where a JS timer
 * stops. Without the module (a build without the native code), the JS timers, and one log line that
 * says they stop with no view.
 */
export function nativeTimers(
  name: string,
  log: (line: string) => void = line => console.log(line),
  modules: Record<string, unknown> = NativeModules,
  subscribe?: TickSubscribe,
): ActionTimers {
  // One instance per module: two would each number their timers from 1, and every tick of one
  // would also run the other's timer of the same number (#289).
  const shared = modules === NativeModules && subscribe === undefined;
  const known = shared ? sharedTimers.get(name) : undefined;
  if (known) {
    return known;
  }
  const timers = makeTimers(name, log, modules, subscribe);
  if (shared) {
    sharedTimers.set(name, timers);
  }
  return timers;
}

const sharedTimers = new Map<string, ActionTimers>();

/**
 * Resolves after `ms` on `timers`: on `nativeTimers` it resolves with no view open, where a
 * `setTimeout` never fires (Lasso Actions' paste, device round 9, #249, #289).
 */
export function timerWait(timers: ActionTimers, ms: number): Promise<void> {
  return new Promise(resolve => {
    const handle = timers.setInterval(() => {
      timers.clearInterval(handle);
      resolve();
    }, Math.max(1, ms));
  });
}

function makeTimers(
  name: string,
  log: (line: string) => void,
  modules: Record<string, unknown>,
  subscribe?: TickSubscribe,
): ActionTimers {
  const module = modules[name] as TickModule | undefined;
  if (!module?.start || !module?.stop) {
    log(`INKTOOLS timers: no native ${name} module: JS timers, which stop while no view of the plugin shows`);
    return jsTimers;
  }
  const listen: TickSubscribe =
    subscribe ??
    ((event, listener) => {
      const subscription = new NativeEventEmitter(module as never).addListener(event, listener);
      return () => subscription.remove();
    });
  const ticks = new Map<number, () => void>();
  let next = 1;
  listen(`${name}Tick`, key => ticks.get(key)?.());
  return {
    setInterval(fn, ms) {
      const key = next++;
      ticks.set(key, fn);
      module.start(key, ms);
      return key;
    },
    clearInterval(handle) {
      const key = handle as number;
      ticks.delete(key);
      module.stop(key);
    },
  };
}
