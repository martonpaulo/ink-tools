/**
 * Module orchestration (#28, #29, #44): one sync pass per module that is on and that the device
 * probe proved, with the record Settings and the log show (#88). The plugin binds the device stores,
 * the providers and a clock; this file holds the order and the bookkeeping, so it is tested with
 * fakes and no device.
 *
 * State between passes (the last sync time, the rows the last pull wrote, the task links) is
 * returned to the caller, which keeps it. shortcut: Bridge keeps it in memory until its storage
 * lands (#40); after a restart the first pass only pulls, so a tablet edit made before the restart is
 * overwritten by the source's version.
 */
import {CalendarEvent, CalendarProvider, CalendarSyncResult, DeviceCalendarStore, TimeWindow, syncCalendar} from './calendar';
import {CalendarWriter, DeviceEdit, DeviceRelinker, applyCreated, changedSince, conflictWarnings, pushCalendarEdits} from './push';
import {ActivePlan, ModuleId, ProviderId} from './settings';
import {ModuleRun, calendarRun, tasksRun} from './status';
import {DeviceTaskStore, TaskLink, TaskProvider, syncTasks} from './tasks';

/** One calendar service: Google, iCloud or the ICS feeds. Without a writer it is read-only. */
export interface CalendarSource {
  id: ProviderId;
  provider: CalendarProvider;
  writer?: CalendarWriter;
  /** The calendars the owner turned on; all when absent. */
  calendarIds?: string[];
}

/** The tablet's Calendar with the two-way parts: our rows as edits, and the relink of a new row. */
export interface DeviceCalendarEditor extends DeviceCalendarStore, DeviceRelinker {
  /** Our rows in the window, as `rowToDeviceEdit` reads them. */
  listEdits(window: TimeWindow): Promise<DeviceEdit[]>;
}

export interface CalendarState {
  /** Epoch ms when the last pass ended; absent before the first. */
  lastSync?: number;
  /** Our rows as the last pass left them: the push skips an edit that still equals its row. */
  baseline: CalendarEvent[];
}

export interface CalendarModule {
  sources: CalendarSource[];
  store: DeviceCalendarEditor;
  window: TimeWindow;
  /** Receives events made on the tablet; without it they are reported, never dropped. */
  defaultCalendarId?: string;
  /** The warnings the providers sent to their sink since the last call (#61); emptied by the call. */
  takeWarnings?: () => string[];
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One calendar pass: push the tablet's edits first, give new rows their service id, then pull, so
 * the pull never overwrites an edit (#29). The first pass after start only pulls: with no last sync
 * time, Bridge's own writes cannot be told from the owner's edits.
 */
export async function runCalendarModule(m: CalendarModule, state: CalendarState, now: () => number): Promise<{run: ModuleRun; state: CalendarState}> {
  const total: CalendarSyncResult = {created: 0, updated: 0, removed: 0, errors: []};
  const warnings: string[] = [];
  const owner = new Map<string, CalendarSource>();
  const readable: CalendarSource[] = [];
  for (const source of m.sources) {
    try {
      for (const c of await source.provider.listCalendars()) owner.set(c.calendarId, source);
      readable.push(source);
    } catch (e) {
      total.errors.push(`${source.id}: ${message(e)}`);
    }
  }

  if (state.lastSync !== undefined) {
    let edits: DeviceEdit[] = [];
    try {
      edits = changedSince(await m.store.listEdits(m.window), state.lastSync);
    } catch (e) {
      total.errors.push(`reading the tablet's edits: ${message(e)}`);
    }
    const target = (e: DeviceEdit) => owner.get(e.event.eventId ? e.event.calendarId : (m.defaultCalendarId ?? ''));
    for (const source of readable) {
      const mine = edits.filter(e => target(e) === source);
      if (!mine.length) continue;
      if (!source.writer) {
        warnings.push(`${source.id} is read-only: ${mine.length} edit(s) on the tablet were replaced by the source's version`);
        continue;
      }
      const remote: CalendarEvent[] = [];
      for (const calendarId of new Set(mine.filter(e => e.event.eventId).map(e => e.event.calendarId))) {
        try {
          remote.push(...(await source.provider.listEvents(calendarId, m.window)));
        } catch (e) {
          total.errors.push(`${source.id} ${calendarId}: ${message(e)}`);
        }
      }
      const defaultHere = m.defaultCalendarId && owner.get(m.defaultCalendarId) === source ? m.defaultCalendarId : undefined;
      const pushed = await pushCalendarEdits(mine, state.baseline, source.writer, defaultHere, remote);
      total.created += pushed.created.length;
      total.updated += pushed.updated;
      total.removed += pushed.deleted;
      total.errors.push(...pushed.errors, ...(await applyCreated(pushed, m.store)));
      warnings.push(...conflictWarnings(pushed.conflicts));
    }
    const lost = edits.filter(e => !target(e));
    if (lost.length) total.errors.push(`${lost.length} tablet edit(s) belong to no source that is on, so they were not sent`);
  }

  for (const source of readable) {
    try {
      const pulled = await syncCalendar(source.provider, m.store, m.window, source.calendarIds);
      total.created += pulled.created;
      total.updated += pulled.updated;
      total.removed += pulled.removed;
      total.errors.push(...pulled.errors.map(e => `${source.id} ${e}`));
    } catch (e) {
      total.errors.push(`${source.id}: ${message(e)}`);
    }
  }
  warnings.push(...(m.takeWarnings?.() ?? []));

  let baseline = state.baseline;
  try {
    baseline = await m.store.listOurs(m.window);
  } catch (e) {
    total.errors.push(`reading the tablet's rows after the sync: ${message(e)}`);
  }
  const at = now();
  return {run: calendarRun(at, total, warnings), state: {lastSync: at, baseline}};
}

export interface TodoModule {
  provider: TaskProvider;
  store: DeviceTaskStore;
}

/** One to-do pass (#44): the two-way sync, its links kept for the next pass. */
export async function runTodoModule(m: TodoModule, links: TaskLink[], now: () => number): Promise<{run: ModuleRun; links: TaskLink[]}> {
  const result = await syncTasks(m.provider, m.store, links);
  return {run: tasksRun(now(), result), links: result.links};
}

export interface BridgeModules {
  calendar?: CalendarModule;
  todo?: TodoModule;
}

export interface BridgeState {
  calendar: CalendarState;
  links: TaskLink[];
}

export const initialBridgeState = (): BridgeState => ({calendar: {baseline: []}, links: []});

/**
 * One pass over every module `activePlan` allows, each with only the sources that are on. A module
 * that throws gets a run with its error and keeps its state, so one failure never stops the other
 * module and is never shown as a clean run. A module that is allowed but not bound (no sign-in yet)
 * gets a run that says so.
 */
export async function runBridgeSync(
  plan: ActivePlan,
  modules: BridgeModules,
  state: BridgeState,
  now: () => number,
): Promise<{runs: Partial<Record<ModuleId, ModuleRun>>; state: BridgeState}> {
  const runs: Partial<Record<ModuleId, ModuleRun>> = {};
  const next: BridgeState = {calendar: state.calendar, links: state.links};
  const failed = (module: ModuleId, error: string): ModuleRun => ({module, at: now(), counts: {added: 0, changed: 0, removed: 0}, errors: [error], warnings: []});
  for (const id of plan.modules) {
    try {
      if (id === 'calendar') {
        const cal = modules.calendar;
        if (!cal) { runs.calendar = failed('calendar', 'no calendar source is signed in'); continue; }
        const sources = cal.sources.filter(s => plan.providers.includes(s.id));
        if (!sources.length) { runs.calendar = failed('calendar', 'no calendar source is turned on'); continue; }
        const done = await runCalendarModule({...cal, sources}, state.calendar, now);
        runs.calendar = done.run;
        next.calendar = done.state;
      } else if (id === 'todo') {
        const todo = modules.todo;
        if (!todo || !plan.providers.includes('todoist')) { runs.todo = failed('todo', 'Todoist is not turned on or not signed in'); continue; }
        const done = await runTodoModule(todo, state.links, now);
        runs.todo = done.run;
        next.links = done.links;
      }
      // digest has no sync yet (#39): it is never in a run.
    } catch (e) {
      runs[id] = failed(id, message(e));
    }
  }
  return {runs, state: next};
}
