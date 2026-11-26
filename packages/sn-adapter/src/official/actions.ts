/**
 * A plugin's own actions, run by a command from inkctl with no screen and no press (#283). Each
 * plugin passes the reader of its `action.json`, in a folder inkctl can write and the plugin can
 * read, and its table of actions; every ACTION_POLL_MS the channel reads the file, runs a request
 * whose id is new, and logs the answer under ReactNativeJS for inkctl to read:
 * `INKTOOLS action <plugin> <id> <n>/<count> <json>`. `cli/inkctl/src/inkctl` owns the other side.
 *
 * A request is `{"id": hex, "action": name, "args": {...}, "at": <the tablet's time in ms>}`. One
 * older than ACTION_MAX_AGE_MS, such as a file left from before a host restart, is answered
 * `stale` and never run. The timer is the one PluginHost already runs for Account Sync's automatic
 * pass; whether it runs while the tablet sleeps is a device check of #283.
 */

/** The request file's name, in each plugin's own folder. */
export const ACTION_FILE = 'action.json';
/** Every answer line starts with this, then the plugin, the request id, the chunk and the count. */
export const ACTION_MARK = 'INKTOOLS action';
export const ACTION_POLL_MS = 1_200;
export const ACTION_MAX_AGE_MS = 60_000;
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

/** A request the action refuses, such as a bad argument: answered with ACTION_REFUSED, not ACTION_FAILED. */
export class ActionRefused extends Error {
  constructor(message: string, readonly code: number = ACTION_REFUSED) {
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
  timers = {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
  },
}: ActionChannelOptions): ActionChannel {
  const answered: string[] = [];
  let busy = false;

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
      const code = error instanceof ActionRefused ? error.code : ACTION_FAILED;
      return {ok: false, code, message: error instanceof Error ? error.message : String(error)};
    }
  }

  const channel: ActionChannel = {
    async check() {
      if (busy) {
        return;
      }
      busy = true;
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
        actionLines(plugin, id, await answer(text)).forEach(log);
      } finally {
        busy = false;
      }
    },
    stop() {
      timers.clearInterval(handle);
    },
  };
  const handle = timers.setInterval(() => {
    channel.check();
  }, ACTION_POLL_MS);
  return channel;
}
