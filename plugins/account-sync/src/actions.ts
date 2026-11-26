/**
 * Account Sync's actions inkctl runs by command, with no screen (#283): `sync`, the same pass as the
 * Settings view's «Sync now», for every module that is on or, with `args.module`, one of them. The
 * request file sits in the sign-in drop folder, which inkctl already writes and BridgeFiles reads
 * (registry storage.sign-in-drop-folder); sn-adapter's channel owns the request and answer format.
 */
import {ACTION_FILE, ActionRefused, type Action, type ActionResult} from '@ink-tools/sn-adapter/official';
import type {ModuleId} from '@ink-tools/sync-core';
import {callFiles, TextFiles} from './files';
import {SECRET_DROP_FOLDER} from './secretStore';
import {runLogLines} from './statusText';
import type {SyncRunner} from './sync';

/** The modules a `sync --module` names; the digest has no sync of its own yet. */
const SYNC_MODULES: ModuleId[] = ['calendar', 'todo'];

export const ACTION_PATH = `${SECRET_DROP_FOLDER}/${ACTION_FILE}`;

/** The request file's text, null when there is none; a refused read throws its reason. */
export async function readActionFile(files?: TextFiles): Promise<string | null> {
  const read = await callFiles(f => f.readText(ACTION_PATH), files);
  if (!read.ok) {
    throw new Error(read.message);
  }
  return read.value;
}

/**
 * The `sync` action: one pass, joined when one already runs. Its line is the `[Bridge] sync <module>:`
 * line the pass logs for each module that ran in it; a pass where none ran is a failure with why.
 */
export function syncAction(runner: SyncRunner, now: () => number = Date.now): Action {
  return async (args): Promise<ActionResult> => {
    const only = args.module;
    if (only !== undefined && !SYNC_MODULES.includes(only as ModuleId)) {
      throw new ActionRefused(`module must be one of ${SYNC_MODULES.join(', ')}`);
    }
    const started = now();
    const snapshot = await runner.syncNow({only: only as ModuleId | undefined});
    if (snapshot.problem) {
      throw new Error(`not run: ${snapshot.problem}`);
    }
    const ran = Object.values(snapshot.runs).filter(run => run && run.at >= started);
    if (!ran.length) {
      const why = Object.entries(snapshot.probe)
        .filter(([, problems]) => problems?.length)
        .map(([id, problems]) => `${id}: ${problems!.join(', ')}`);
      throw new Error(`no module ran${why.length ? `: ${why.join('; ')}` : ': none is on'}`);
    }
    const lines = ran.map(run => runLogLines(run!)[0]);
    return {line: lines.join('\n'), modules: ran.map(run => run!.module)};
  };
}
