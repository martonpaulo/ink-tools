/**
 * Smart Pen's actions inkctl runs by command, with no screen (#298): `record-pen` turns the pen
 * recorder on (`args.on` true) or off (false, answering the tape), `replay-pen` plays a tape to
 * the modules that are on, as if the pen had written it (sn-adapter `penTape.ts`), and
 * `fail-next-convert` makes the next «Convert to Text» fail, for a device round (#257, `faults.ts`). The request file
 * sits in Smart Pen's folder of the hidden `.data/plugin/`, which inkctl writes and Supernote Cloud
 * does not sync; sn-adapter's channel owns the request and answer format.
 */
import {
  ACTION_FILE,
  ActionRefused,
  deviceReplay,
  nativeTimers,
  parsePenTape,
  type PenTape,
  replayPenTape,
  type ReplayCounts,
  type Result,
  pluginDataFolder,
  startPenRecording,
  stopPenRecording,
  type Action,
} from '@ink-tools/sn-adapter/official';
import {readText} from '@ink-tools/picture-search/storage';
import {armConvertFailure} from './faults';

/** Smart Pen's own folder in the hidden `.data/plugin/`; SmartPenFilesPackage.java `ACTION_HOME`. */
export const ACTION_HOME = pluginDataFolder('inktools-smart-pen');
export const ACTION_PATH = `${ACTION_HOME}/${ACTION_FILE}`;
/** The native timer module; SmartPenFilesPackage.java `TICKS_MODULE`. Its ticks reach JavaScript with no view open. */
export const TICKS_MODULE = 'SmartPenTicks';

/** The request file's text, null when there is none; a refused read throws its reason. */
export async function readActionFile(read: typeof readText = readText): Promise<string | null> {
  const text = await read(ACTION_PATH);
  if (!text.ok) {
    throw new Error(text.message);
  }
  return text.value;
}

export type PenActionsHost = {
  start(): Result<true>;
  stop(): Result<{tape: PenTape; dropped: number}>;
  replay(tape: PenTape): Promise<Result<ReplayCounts>>;
  armConvertFailure(): void;
};

const DEVICE: PenActionsHost = {
  start: () => startPenRecording(),
  stop: stopPenRecording,
  // The same native timers as the action channel: a replay runs with no Smart Pen view (#469).
  replay: tape => replayPenTape(tape, deviceReplay(nativeTimers(TICKS_MODULE))),
  armConvertFailure,
};

export function penActions(host: PenActionsHost = DEVICE): Record<string, Action> {
  return {
    'record-pen': async args => {
      if (typeof args.on !== 'boolean') {
        throw new ActionRefused('record-pen needs args.on, true or false');
      }
      if (args.on) {
        // With every module off nothing hears the pen: refuse before the owner writes (#449).
        const started = host.start();
        if (!started.ok) {
          throw new ActionRefused(started.message);
        }
        return {line: 'SmartPen: pen recording on'};
      }
      const stopped = host.stop();
      if (!stopped.ok) {
        throw new Error(stopped.message);
      }
      const {tape, dropped} = stopped.value;
      return {line: `SmartPen: pen recording off: ${tape.events.length} events, ${dropped} dropped`, tape, dropped};
    },
    'replay-pen': async args => {
      const parsed = parsePenTape(JSON.stringify(args.tape ?? null));
      if (!parsed.ok) {
        throw new ActionRefused(parsed.message);
      }
      const played = await host.replay(parsed.value);
      if (!played.ok) {
        throw new Error(played.message);
      }
      const {listeners, motions, penUps, strokes, listenerErrors} = played.value;
      const plain = listeners === 0 ? ', no module on: plain ink' : '';
      return {
        line: `SmartPen: replayed ${penUps} pen-ups (${strokes} strokes) and ${motions} motions, ${listenerErrors} listener errors${plain}`,
        ...played.value,
      };
    },
    'fail-next-convert': async () => {
      host.armConvertFailure();
      return {line: 'SmartPen: the next Convert to Text fails on purpose'};
    },
  };
}
