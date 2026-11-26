/**
 * What the owner sees about each module's sync (#88): the record of its last run and why a module
 * that is on does not run. Pure data; Bridge words it for Settings and writes it to the log.
 * The record lives in memory while the plugin runs: Bridge has no storage yet (#40), and the sync
 * runs only while the plugin is alive (#39), so «last synced» is the last run since Bridge started.
 */
import type {CalendarSyncResult} from './calendar';
import type {BridgeSettings, ModuleId, ProviderId} from './settings';
import type {SyncResult} from './tasks';

export interface ModuleRun {
  module: ModuleId;
  /** Epoch ms when the run ended. */
  at: number;
  counts: {added: number; changed: number; removed: number};
  /** What failed; the failed items were skipped. */
  errors: string[];
  /** What was read inexactly, such as an unsupported recurrence part or a time zone read as UTC (#61). */
  warnings: string[];
  /**
   * The module is on but could not run at all, such as a missing sign-in or no source that reads:
   * nothing was read or written, and `errors` says why. Settings says «not running», never «synced».
   */
  notRun?: true;
  /**
   * Tablet-only items the pass left on the tablet, since «Send tablet-only items» is off: Settings
   * says it once, at that setting, never as a warning (#411).
   */
  keptLocal?: number;
  /**
   * The calendars this pass read from a service that accepts writes (#29): the choices of Settings'
   * calendar for new tablet events. Absent on a to-do run and on a calendar run that read nothing.
   */
  calendars?: CalendarChoice[];
}

/** A calendar an event made on the tablet can go to: its service id, name and provider (#29). */
export interface CalendarChoice {
  calendarId: string;
  name: string;
  provider: ProviderId;
}

export type ModuleStatus =
  | {state: 'off'}
  /**
   * On, but nothing was written: the device probe turned it off or has not answered (#67), or the
   * last run could not start (`ModuleRun.notRun`), which gives `at`, the time it tried.
   */
  | {state: 'blocked'; reasons: string[]; at?: number}
  /** On and available, with no run since Bridge started. */
  | {state: 'waiting'}
  | {state: 'ran'; run: ModuleRun};

/** The record of one calendar run, with the warnings its providers sent to their sink. */
export function calendarRun(at: number, result: CalendarSyncResult, warnings: string[] = []): ModuleRun {
  return {
    module: 'calendar',
    at,
    counts: {added: result.created, changed: result.updated, removed: result.removed},
    errors: [...result.errors],
    warnings: [...warnings],
  };
}

/** The record of one to-do run; both directions add up, so the owner sees one count per kind. */
export function tasksRun(at: number, result: SyncResult): ModuleRun {
  const c = result.counts;
  return {
    module: 'todo',
    at,
    counts: {
      added: c.createdLocal + c.createdRemote,
      changed: c.updatedLocal + c.updatedRemote,
      removed: c.removedLocal + c.removedRemote,
    },
    errors: [...result.errors],
    warnings: [...result.warnings],
    keptLocal: result.keptLocal,
  };
}

/**
 * Why a module that is on waits: no pass has probed it since the plugin host started (#43). It
 * follows «On, but not running: », so it holds no colon of its own: one sentence (#368).
 */
export const DEVICE_CHECK_PENDING = 'the device check runs with the next sync';

/** The probe's problems per module; a module with no entry has no probe answer. */
export type ProbeProblems = Partial<Record<ModuleId, string[]>>;

/** One module's status from the settings, the probe and the runs since Bridge started. */
export function moduleStatus(
  id: ModuleId,
  settings: BridgeSettings,
  probe: ProbeProblems,
  runs: Partial<Record<ModuleId, ModuleRun>>,
): ModuleStatus {
  if (!settings.modules[id]) return {state: 'off'};
  const problems = probe[id];
  // A missing probe answer blocks the module, as `activePlan` does: never write without proof.
  // The check runs only in a pass that needs the module, never at host start nor on a Settings open (#43).
  if (problems === undefined) return {state: 'blocked', reasons: [DEVICE_CHECK_PENDING]};
  if (problems.length > 0) return {state: 'blocked', reasons: [...problems]};
  const run = runs[id];
  if (run?.notRun) return {state: 'blocked', reasons: [...run.errors], at: run.at};
  return run ? {state: 'ran', run} : {state: 'waiting'};
}
