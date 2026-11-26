import {NativeModules} from 'react-native';
import {answerLines, COMMAND_PATH, commandId, runCommand, UNKNOWN_ID, type HelperApi} from './helper';

type Reader = {readCommand(path: string): Promise<string>};

/** After a command, Probe reads the command file again this often, for this long (#286). */
export const LISTEN_POLL_MS = 270;
export const LISTEN_MS = 120_000;
/** The answers kept by id, so a press of a command the listener already ran logs it again. */
export const ANSWERS_KEPT = 20;

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realTimers: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface CommandRunner {
  /** One press of «Run Command»: run the file's command, or log its answer again when it already ran. */
  press(): Promise<void>;
  /** One read of the listener: run the file's command only when its id is new; anything else is ignored. */
  listen(): Promise<void>;
}

/**
 * The command channel's Probe side (#148, #286). A press reads inkctl's command file, runs it and
 * logs the answer (`SNPROBE answer …` under ReactNativeJS). After each command, Probe keeps reading
 * the file every LISTEN_POLL_MS until LISTEN_MS after the last one, so inkctl's next command needs
 * no press. Each id runs at most once: the id is marked before the first await, so a press and a
 * listener read of the same file never both run it. Never throws: an unreadable file at a press is
 * an `unknown` answer; at a listener read it is ignored, so a stale file never floods the log.
 */
export function createCommandRunner(
  api: HelperApi,
  modules: Record<string, unknown> = NativeModules,
  log: (line: string) => void = line => console.log(line),
  now: () => number = Date.now,
  timers: Timers | null = realTimers,
): CommandRunner {
  const answered = new Map<string, string[]>();
  let listenUntil = 0;
  let handle: unknown = null;
  let reading = false;

  async function read(): Promise<string> {
    const reader = modules.ProbeProviders as Reader | undefined;
    if (!reader?.readCommand) {
      throw new Error('native module ProbeProviders has no readCommand: build with `npm run build`');
    }
    return reader.readCommand(COMMAND_PATH);
  }

  function keepListening(): void {
    listenUntil = now() + LISTEN_MS;
    if (timers && handle === null) {
      handle = timers.setInterval(() => {
        if (now() > listenUntil) {
          timers.clearInterval(handle);
          handle = null;
          return;
        }
        if (!reading) {
          runner.listen();
        }
      }, LISTEN_POLL_MS);
    }
  }

  async function run(text: string, id: string | null, fromPress: boolean): Promise<void> {
    if (id && answered.has(id)) {
      if (fromPress) {
        (answered.get(id) ?? []).forEach(log); // empty while the listener still runs it: it logs then
      }
      return;
    }
    if (id) {
      answered.set(id, []);
      while (answered.size > ANSWERS_KEPT) {
        answered.delete(answered.keys().next().value as string);
      }
    }
    const result = await runCommand(text, api);
    const lines = answerLines(result.id, result.answer);
    if (id && answered.has(id)) {
      answered.set(id, lines);
    }
    lines.forEach(log);
    keepListening();
  }

  const runner: CommandRunner = {
    async press() {
      let text: string;
      try {
        text = await read();
      } catch (error) {
        // No file, no id: inkctl reads an `unknown` answer that follows its push as this press's failure.
        answerLines(UNKNOWN_ID, {ok: false, code: 1, message: `command file: ${(error as Error).message}`}).forEach(log);
        return;
      }
      await run(text, commandId(text), true);
    },
    async listen() {
      reading = true;
      try {
        const text = await read();
        const id = commandId(text);
        if (id) {
          await run(text, id, false);
        }
      } catch {
        // A file that is missing or half written now is read again at the next tick.
      } finally {
        reading = false;
      }
    },
  };
  return runner;
}

/** One press with no listener after it, as a test or a one-off call needs. */
export async function pressCommand(
  api: HelperApi,
  modules: Record<string, unknown> = NativeModules,
  log: (line: string) => void = line => console.log(line),
): Promise<void> {
  await createCommandRunner(api, modules, log, Date.now, null).press();
}
