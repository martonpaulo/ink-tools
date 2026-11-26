/**
 * Plugin Diagnostics' actions inkctl runs by command, with no screen (#283): `run-probe`, the same
 * probe as the view's «Run Probe». The request file sits in `MyStyle/Probe/`, the one folder
 * `ProbeProviders.readCommand` reads; sn-adapter's channel owns the request and answer format.
 */
import {NativeModules} from 'react-native';
import {ACTION_FILE, type Action} from '@ink-tools/sn-adapter/actions';
import {PROBE_FOLDER} from './helper';
import {probe, TAG} from './probe';

type Reader = {readCommand(path: string): Promise<string>};

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
