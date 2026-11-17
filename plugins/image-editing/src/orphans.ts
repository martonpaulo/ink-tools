/**
 * Removes, once per plugin session, the preview and state PNGs that earlier builds left behind
 * (#182): every file of Retouch's own naming in `MyStyle/Retouch/`, which builds before #198 used
 * and this build never writes, and every one in the working folder that the history does not name
 * and that was written before this session began. Any other file stays: `history.json`,
 * `styles.json` and whatever a person put there. A failure is logged and never stops a press.
 */
import {Result, SHARED_ROOT} from '@ink-tools/sn-adapter/official';
import {historyPath} from './edit';
import {parseHistory} from './history';
import {RetouchNative} from './native';

/** The folder builds before #198 wrote their PNGs to. */
export const LEGACY_DIR = `${SHARED_ROOT}/MyStyle/Retouch`;

/**
 * Retouch's own PNG names, each with the ms stamp of the press that wrote it: `preview-<ms>`,
 * `<ms>-<edit>`, `style-source-<ms>` and `style-<ms>-<style>`; builds before the stamp wrote the
 * grid as `style-<style>` (#133).
 */
const OWN_NAMES = [
  /^preview-(\d+)\.png$/,
  /^(\d+)-[a-z_]+\.png$/,
  /^style-source-(\d+)\.png$/,
  /^style-(\d+)-[a-z_]+\.png$/,
  /^style-[a-z_]+\.png$/,
];

/**
 * When a file of Retouch's own naming was written, in ms; 0 for a name with no stamp, so it counts
 * as older than any session; null for any other name.
 */
export function stampOf(name: string): number | null {
  for (const pattern of OWN_NAMES) {
    const match = pattern.exec(name);
    if (match) {
      return match[1] ? Number(match[1]) : 0;
    }
  }
  return null;
}

/**
 * The names in `names` to remove: Retouch's own, written before `since`, and not one of `keep`.
 * Pure, for the tests.
 */
export function orphansIn(
  names: string[],
  keep: ReadonlySet<string>,
  since: number,
): string[] {
  return names.filter(name => {
    const stamp = stampOf(name);
    return stamp !== null && stamp < since && !keep.has(name);
  });
}

export type SweepDeps = {
  native: Pick<RetouchNative, 'listDir' | 'readText' | 'deleteFile'>;
  workDir: () => Promise<Result<string>>;
  log: (line: string) => void;
};

/** When this plugin session began: files stamped from then on belong to it. */
const SESSION_START = Date.now();
let swept = false;

/** The file names the history in `work` names, or null when it cannot be read as a history. */
async function namedIn(work: string, deps: SweepDeps): Promise<Set<string> | null> {
  const read = await deps.native.readText(historyPath(work));
  const history = read.ok ? parseHistory(read.value) : null;
  if (!history) {
    return null;
  }
  const prefix = `${work}/`;
  const names = new Set<string>();
  for (const entry of history.entries) {
    for (const state of entry.states) {
      if (state.path.startsWith(prefix)) {
        names.add(state.path.slice(prefix.length));
      }
    }
  }
  return names;
}

/** Removes the orphans of `folder`; the names it removed. */
async function sweepFolder(
  folder: string,
  keep: ReadonlySet<string>,
  since: number,
  deps: SweepDeps,
): Promise<string[]> {
  const listed = await deps.native.listDir(folder);
  if (!listed.ok) {
    deps.log(`sweep: list ${folder}: ${listed.code} ${listed.message}`);
    return [];
  }
  const removed: string[] = [];
  for (const name of orphansIn(listed.value ?? [], keep, since)) {
    const gone = await deps.native.deleteFile(`${folder}/${name}`);
    if (gone.ok && gone.value) {
      removed.push(name);
    } else {
      deps.log(`sweep: delete ${folder}/${name} failed`);
    }
  }
  return removed;
}

/**
 * The once-per-session sweep; the later calls of a session do nothing. It logs one line with the
 * count and names it removed from each folder, so a device round can check it.
 */
export async function sweepOrphans(
  deps: SweepDeps,
  since: number = SESSION_START,
): Promise<void> {
  if (swept) {
    return;
  }
  swept = true;
  const legacy = await sweepFolder(LEGACY_DIR, new Set(), Number.POSITIVE_INFINITY, deps);
  deps.log(`sweep: ${LEGACY_DIR}: removed ${legacy.length} [${legacy.join(', ')}]`);
  const work = await deps.workDir();
  if (!work.ok) {
    deps.log(`sweep: getPluginDirPath: ${work.code} ${work.message}`);
    return;
  }
  const keep = await namedIn(work.value, deps);
  if (!keep) {
    // A history that cannot be read names nothing for sure, so nothing there is removed.
    deps.log(`sweep: ${historyPath(work.value)} unreadable; working folder kept`);
    return;
  }
  const current = await sweepFolder(work.value, keep, since, deps);
  deps.log(`sweep: ${work.value}: removed ${current.length} [${current.join(', ')}]`);
}

/** For the tests: lets the next call sweep again. */
export function resetSweep(): void {
  swept = false;
}
