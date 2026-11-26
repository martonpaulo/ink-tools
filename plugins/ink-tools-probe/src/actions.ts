/**
 * Ink Tools Probe's actions inkctl runs by command, with no screen (#283): `run-probe`, the same
 * probe as the view's «Run Probe». The request file sits in Probe's folder of the hidden
 * `.data/plugin/`, the one folder `ProbeProviders.readCommand` reads (#148); sn-adapter's channel owns the request and answer format.
 */
import {NativeModules} from 'react-native';
import {ACTION_FILE, type Action} from '@ink-tools/sn-adapter/actions';
import {PROBE_FOLDER} from './helper';
import {probe, TAG} from './probe';

type Reader = {readCommand(path: string): Promise<string>};
type Cleaner = {removeLegacyFiles(): Promise<number>};

export const ACTION_PATH = `${PROBE_FOLDER}${ACTION_FILE}`;

/** The request file's text; a missing file or module throws, and the channel reads again later. */
export function readActionFile(modules: Record<string, unknown> = NativeModules): Promise<string> {
  const reader = modules.ProbeProviders as Reader | undefined;
  if (!reader?.readCommand) {
    return Promise.reject(new Error('native module ProbeProviders has no readCommand: build with `npm run build`'));
  }
  return reader.readCommand(ACTION_PATH);
}

/**
 * `run-probe`: the probe's lines, logged as «Run Probe» logs them; its line is the last, such as
 * `probe done`. A probe that needs something or failed is a failed action, never a success (#257).
 */
export function runProbeAction(runtime: Record<string, unknown>): Action {
  return async () => {
    const outcome = await probe(runtime);
    const lines = outcome.lines;
    const last = lines[lines.length - 1] ?? '';
    if (outcome.status !== 'done') {
      throw new Error(last);
    }
    return {line: `${TAG} ${last}`, lines};
  };
}

/**
 * At start, removes the command, page and picture files that builds before #148's move left in
 * `MyStyle/Probe/`, which Supernote Cloud syncs (#22), and logs how many; never throws.
 */
export async function removeLegacyFiles(
  modules: Record<string, unknown> = NativeModules,
  log: (line: string) => void = console.log,
): Promise<void> {
  const cleaner = modules.ProbeProviders as Cleaner | undefined;
  if (!cleaner?.removeLegacyFiles) {
    log(`${TAG} legacy files: native module ProbeProviders has no removeLegacyFiles`);
    return;
  }
  try {
    const removed = await cleaner.removeLegacyFiles();
    if (removed > 0) {
      log(`${TAG} legacy files: removed ${removed} from MyStyle/Probe`);
    }
  } catch (error) {
    log(`${TAG} legacy files: ${error instanceof Error ? error.message : String(error)}`);
  }
}
