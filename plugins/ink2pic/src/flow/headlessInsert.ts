/**
 * «Insert best picture» with no plugin view (#74, owner on build 15): the button is registered with
 * showType 0, so the person stays on the note while the lassoed word is read and the best picture
 * inserted. Each step goes to the log. A failure opens the view, through showPluginView (official
 * docs), on the search screen with the word and the sentence (#96); a missing permission opens the view's onboarding, which then
 * runs the insert as before. Whether the host delivers a showType 0 press and runs the SDK calls
 * with no view is TO TEST on the device (brief section 10.5).
 *
 * JS timers may stop while no view is open (brief section 3.3, REPORTED), so the flow never waits
 * on one to end (#93): its limit is measured with Date.now() before each step, and a press after
 * that limit starts again instead of waiting for a run that may never end. The lasso place is
 * marked to be read again before the word is deleted or the picture lassoed: the person stays on
 * the note meanwhile.
 */
import {
  log,
  logged,
  timed,
  startSession,
  getSettings,
  pluginFolder,
  readLassoQuery,
  type LassoPlace,
} from '../profile';
import {missingPermissions} from '../onboarding/permissions';
import {queuePress, showPluginView} from '@supernote-tools/sn-adapter/official';
import {DEFINE_BUTTON_ID, INSERT_BUTTON_ID} from '../buttons';
import {atStep, failureText, StepFailure} from './failure';
import {insertBest, InsertLimit, QuickInsert} from './quickInsert';
import {insertDefinition} from './insertDefinition';
import {copy} from '../ui/copy';

export type HeadlessDeps = {
  session: typeof startSession;
  folder: typeof pluginFolder;
  missing: typeof missingPermissions;
  read: typeof readLassoQuery;
  insert: typeof insertBest;
  define: typeof insertDefinition;
  show: typeof showPluginView;
  /** Hands a press to the view, as if the host had opened it for that button. */
  press: typeof queuePress;
};

const DEVICE: HeadlessDeps = {
  session: startSession,
  folder: pluginFolder,
  missing: missingPermissions,
  read: readLassoQuery,
  insert: insertBest,
  define: insertDefinition,
  show: showPluginView,
  press: queuePress,
};

/**
 * The longest one press may take, measured with Date.now(): about four source budgets (brief
 * section 8.5) for the search, the thumbnails, the download and the insert.
 */
export const NO_VIEW_LIMIT_MS = 60000;

/**
 * What the view opens on after a failure (#96): the search screen, as Choose picture opens it, with
 * the word, where it was, and the sentence in its status line; a lasso failure shows as Find
 * picture shows one, with an empty field.
 */
export type HeadlessNote = {
  query: string;
  place: LassoPlace | null;
  lassoFailure: StepFailure | null;
  text: string;
};

/** The failure the view shows once it opens; taken once. */
let note: HeadlessNote | null = null;
const noteListeners = new Set<() => void>();
/** When the running press started, or null; a newer press holds `run` (#93). */
let runningSince: number | null = null;
let run = 0;

/**
 * When the last no-view press came, set at once, before any await: the host may mount the view or
 * send lifecycle 2 for a showType 0 press, and the view's decision on open must not take the same
 * lasso for «Choose picture» and run a picture search beside the press (#115, device round
 * 2026-11-16: a definition press logged `search "maçã"` first).
 */
let lastPressAt: number | null = null;

/** When the last no-view press came, or null when none came in this runtime. */
export function lastNoViewPressAt(): number | null {
  return lastPressAt;
}

export function resetNoViewPressForTests(): void {
  lastPressAt = null;
}

/** The last failed headless insert, once; null when there is none. */
export function takeHeadlessNote(): HeadlessNote | null {
  const taken = note;
  note = null;
  return taken;
}

/** Calls `listener` when a failed headless insert leaves a sentence; returns the stop function. */
export function onHeadlessNote(listener: () => void): () => void {
  noteListeners.add(listener);
  return () => noteListeners.delete(listener);
}

/** What a no-view button does: its log name, its id for the view, and its insert (#74, #115). */
type NoViewMode = {
  name: string;
  buttonId: number;
  run: (
    deps: HeadlessDeps,
    word: string,
    at: LassoPlace | null,
    limit: InsertLimit,
  ) => Promise<QuickInsert>;
};

const PICTURE: NoViewMode = {
  name: 'insert picture (no view)',
  buttonId: INSERT_BUTTON_ID,
  run: (deps, word, at, limit) => deps.insert(word, at, undefined, limit),
};

const DEFINITION: NoViewMode = {
  name: 'insert definition (no view)',
  buttonId: DEFINE_BUTTON_ID,
  run: (deps, word, at, limit) => deps.define(word, at, undefined, limit),
};

async function showFailure(
  mode: NoViewMode,
  failed: HeadlessNote,
  deps: HeadlessDeps,
): Promise<void> {
  log(`${mode.name} failed: ${failed.text}`);
  note = failed;
  noteListeners.forEach(listener => listener());
  await logged('showPluginView', deps.show);
}

/** Runs one «Insert best picture» press with no view. Never rejects; a second press waits its turn. */
export function insertWithoutView(deps: HeadlessDeps = DEVICE): Promise<void> {
  lastPressAt = Date.now();
  return runWithoutView(PICTURE, deps);
}

/**
 * Runs one «Insert definition» press with no view, under the same guard (#115). A press that
 * reaches here after the switch was turned off, such as a queued one, is ignored.
 */
export async function defineWithoutView(
  deps: HeadlessDeps = DEVICE,
  settings: typeof getSettings = getSettings,
): Promise<void> {
  lastPressAt = Date.now();
  if (!(await settings()).definition) {
    log(`${DEFINITION.name}: the switch is off, press ignored`);
    return;
  }
  return runWithoutView(DEFINITION, deps);
}

/** One press of either no-view button: one run at a time, across both buttons. */
async function runWithoutView(
  mode: NoViewMode,
  deps: HeadlessDeps,
): Promise<void> {
  const started = Date.now();
  const age = runningSince === null ? null : started - runningSince;
  if (age !== null && age <= NO_VIEW_LIMIT_MS) {
    log(`${mode.name}: already running, press ignored`);
    return;
  }
  runningSince = started;
  const own = ++run;
  const deadline = started + NO_VIEW_LIMIT_MS;
  // The word and its place once read, for the search screen a failure opens (#96).
  let word = '';
  let at: LassoPlace | null = null;
  try {
    await deps.session();
    log(`${mode.name}: start`);
    if (age !== null) {
      log(
        `${mode.name}: the last press is still running after ${age} ms; starting again`,
      );
    }
    await deps.folder();
    if ((await deps.missing()).length > 0) {
      log(`${mode.name}: a permission is missing, opening the view`);
      deps.press(mode.buttonId);
      await logged('showPluginView', deps.show);
      return;
    }
    const query = await timed('lasso', () => deps.read());
    if (!query.ok) {
      log(`${mode.name}: no word, ${query.code} ${query.message}`);
      const lassoFailure = atStep('lasso', query);
      await showFailure(
        mode,
        {query: '', place: null, lassoFailure, text: failureText(lassoFailure)},
        deps,
      );
      return;
    }
    word = query.value.query;
    log(`${mode.name}: "${word}"`);
    const {place} = query.value;
    at = place ? {...place, recheck: true} : null;
    const inserted = await mode.run(deps, word, at, {deadline});
    if (!inserted.ok) {
      await showFailure(
        mode,
        {query: word, place: at, lassoFailure: null, text: inserted.text},
        deps,
      );
      return;
    }
    log(`${mode.name}: done, ${inserted.value}`);
  } catch (error) {
    log(`${mode.name} failed: ${String(error)}`);
    await showFailure(
      mode,
      {
        query: word,
        place: at,
        lassoFailure: null,
        text: copy['error.unexpected'],
      },
      deps,
    );
  } finally {
    if (run === own) {
      runningSince = null;
    }
  }
}
