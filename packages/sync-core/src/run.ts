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
import {ActivePlan, ModuleId, ProviderId, TwoWayModule} from './settings';
import {ModuleRun, calendarRun, tasksRun} from './status';
import {DeviceTaskStore, PULL_ONLY, TabletOnlyPolicy, TaskLink, TaskProvider, syncTasks} from './tasks';

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
  /**
   * Epoch ms when the last pass that read each source ended (#211). A source that failed keeps its
   * older time, so its tablet edits stay newer than it and go out on the next pass where it reads.
   * A source with no time here uses `lastSync`.
   */
  sourceSync?: Partial<Record<ProviderId, number>>;
  /**
   * Our rows as the last pass left them: the push skips an edit that still equals its row. The rows
   * of a source that did not read keep their older version, so its pending edits still differ (#211).
   */
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
export async function runCalendarModule(
  m: CalendarModule,
  state: CalendarState,
  now: () => number,
  policy: TabletOnlyPolicy = PULL_ONLY,
): Promise<{run: ModuleRun; state: CalendarState}> {
  const total: CalendarSyncResult = {created: 0, updated: 0, removed: 0, errors: []};
  const warnings: string[] = [];
  if (m.store.repair) {
    // A failed repair stops the pass: an old row it could not fix would read as no pulled event, and
    // the pull would add a second row for it (#28).
    try {
      const repaired = await m.store.repair();
      if (repaired) warnings.push(`gave ${repaired} older tablet row(s) the shape the Calendar app shows`);
    } catch (e) {
      total.errors.push(`repair tablet rows: ${message(e)}`);
      return {run: {...calendarRun(now(), total, [...warnings, ...(m.takeWarnings?.() ?? [])]), notRun: true}, state};
    }
  }
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

  // No source reads: nothing can be sent or pulled. The state stays, so the tablet's edits are still
  // newer than the last sync and go out on the next pass that reads (#88).
  if (!readable.length) {
    return {run: {...calendarRun(now(), total, m.takeWarnings?.() ?? []), notRun: true}, state};
  }

  // Tablet edits that were not sent: the pull leaves their rows alone and their source keeps its
  // mark, so they are still pending on the next pass (#216).
  const held: CalendarEvent[] = [];
  const stalled = new Set<ProviderId>();
  if (state.lastSync !== undefined) {
    let all: DeviceEdit[];
    try {
      all = await m.store.listEdits(m.window);
    } catch (e) {
      // Unread edits cannot be sent, and a pull would write the source's version over them: the pass
      // stops and the state stays, as when no source reads (#88, #216).
      total.errors.push(`reading the tablet's edits: ${message(e)}`);
      return {run: {...calendarRun(now(), total, [...warnings, ...(m.takeWarnings?.() ?? [])]), notRun: true}, state};
    }
    const target = (e: DeviceEdit) => owner.get(e.event.eventId ? e.event.calendarId : (m.defaultCalendarId ?? ''));
    for (const source of readable) {
      const mine = changedSince(all, state.sourceSync?.[source.id] ?? state.lastSync).filter(e => target(e) === source);
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
      const pushed = await pushCalendarEdits(mine, state.baseline, source.writer, defaultHere, remote, policy);
      if (pushed.keptLocal) warnings.push(keptWarning(pushed.keptLocal, 'event'));
      total.created += pushed.created.length;
      total.updated += pushed.updated;
      total.removed += pushed.deleted;
      total.errors.push(...pushed.errors, ...(await applyCreated(pushed, m.store)));
      if (pushed.failed.length) {
        held.push(...pushed.failed);
        stalled.add(source.id);
      }
      warnings.push(...conflictWarnings(pushed.conflicts));
    }
    const lost = changedSince(all, state.lastSync).filter(e => !target(e));
    if (lost.length) {
      total.errors.push(readable.length < m.sources.length
        ? `${lost.length} tablet edit(s) were not sent: their source did not read or is not on; an edit for a source that did not read is sent on the next pass where it reads`
        : `${lost.length} tablet edit(s) belong to no source that is on, so they were not sent`);
    }
  }

  const isHeld = (e: CalendarEvent) => held.some(h => h.calendarId === e.calendarId && h.eventId === e.eventId);
  for (const source of readable) {
    try {
      const pulled = await syncCalendar(source.provider, m.store, m.window, source.calendarIds, isHeld);
      total.created += pulled.created;
      total.updated += pulled.updated;
      total.removed += pulled.removed;
      total.errors.push(...pulled.errors.map(e => `${source.id} ${e}`));
    } catch (e) {
      total.errors.push(`${source.id}: ${message(e)}`);
    }
  }
  warnings.push(...(m.takeWarnings?.() ?? []));

  // A row of a calendar no source read this pass, or whose push failed, keeps its last baseline: on
  // the tablet it holds an edit not sent yet, which must not become the version the next push
  // compares with (#211, #216).
  let baseline = state.baseline;
  try {
    const read = (e: CalendarEvent) => owner.has(e.calendarId) && !isHeld(e);
    baseline = [...(await m.store.listOurs(m.window)).filter(read), ...state.baseline.filter(e => !read(e))];
  } catch (e) {
    total.errors.push(`reading the tablet's rows after the sync: ${message(e)}`);
  }
  const at = now();
  const sourceSync = {...state.sourceSync};
  for (const source of readable) sourceSync[source.id] = stalled.has(source.id) ? (state.sourceSync?.[source.id] ?? state.lastSync) : at;
  return {run: calendarRun(at, total, warnings), state: {lastSync: at, sourceSync, baseline}};
}

const keptWarning = (n: number, kind: string) =>
  `${n} tablet-only ${kind}(s) stayed on the tablet; turn on «Send tablet-only items» to send them`;

export interface TodoModule {
  provider: TaskProvider;
  store: DeviceTaskStore;
}

/** One to-do pass (#44): the two-way sync, its links kept for the next pass. */
export async function runTodoModule(
  m: TodoModule,
  links: TaskLink[],
  now: () => number,
  policy: TabletOnlyPolicy = PULL_ONLY,
): Promise<{run: ModuleRun; links: TaskLink[]}> {
  const result = await syncTasks(m.provider, m.store, links, policy);
  if (result.keptLocal) result.warnings.push(keptWarning(result.keptLocal, 'task'));
  return {run: tasksRun(now(), result), links: result.links};
}

export interface BridgeModules {
  calendar?: CalendarModule;
  todo?: TodoModule;
}

export interface BridgeState {
  calendar: CalendarState;
  links: TaskLink[];
  /**
   * Epoch ms of each module's first pass in this state's life: only tablet items changed after it
   * are sent. shortcut: the links live in memory (#40), so after a restart this restarts too and the
   * next first pass is pull-only again, never a resend; restore it from Settings' `firstLinked` once
   * the links persist.
   */
  firstLinked: Partial<Record<TwoWayModule, number>>;
}

export const initialBridgeState = (): BridgeState => ({calendar: {baseline: []}, links: [], firstLinked: {}});

/**
 * One pass over every module `activePlan` allows, each with only the sources that are on. A module
 * that throws gets a run with its error and keeps its state, so one failure never stops the other
 * module and is never shown as a clean run. A module that is allowed but not bound (no sign-in yet)
 * gets a run marked `notRun` that says why.
 */
export async function runBridgeSync(
  plan: ActivePlan,
  modules: BridgeModules,
  state: BridgeState,
  now: () => number,
): Promise<{runs: Partial<Record<ModuleId, ModuleRun>>; state: BridgeState}> {
  const runs: Partial<Record<ModuleId, ModuleRun>> = {};
  const next: BridgeState = {calendar: state.calendar, links: state.links, firstLinked: {...state.firstLinked}};
  const policy = (id: TwoWayModule): TabletOnlyPolicy => ({firstLinked: state.firstLinked[id], sendTabletOnly: plan.sendTabletOnly[id]});
  const failed = (module: ModuleId, error: string): ModuleRun => ({module, at: now(), counts: {added: 0, changed: 0, removed: 0}, errors: [error], warnings: []});
  const notRun = (module: ModuleId, reason: string): ModuleRun => ({...failed(module, reason), notRun: true});
  for (const id of plan.modules) {
    try {
      if (id === 'calendar') {
        const cal = modules.calendar;
        if (!cal) { runs.calendar = notRun('calendar', 'no calendar source is signed in'); continue; }
        const sources = cal.sources.filter(s => plan.providers.includes(s.id));
        if (!sources.length) { runs.calendar = notRun('calendar', 'no calendar source is turned on'); continue; }
        const done = await runCalendarModule({...cal, sources}, state.calendar, now, policy('calendar'));
        runs.calendar = done.run;
        next.calendar = done.state;
        if (!done.run.notRun) next.firstLinked.calendar ??= done.run.at;
      } else if (id === 'todo') {
        const todo = modules.todo;
        if (!plan.providers.includes('todoist')) { runs.todo = notRun('todo', 'Todoist is not turned on'); continue; }
        if (!todo) { runs.todo = notRun('todo', 'Todoist is not signed in: on the Mac, run inkctl secret set todoist'); continue; }
        const done = await runTodoModule(todo, state.links, now, policy('todo'));
        runs.todo = done.run;
        next.links = done.links;
        next.firstLinked.todo ??= done.run.at;
      }
      // digest has no sync yet (#39): it is never in a run.
    } catch (e) {
      runs[id] = failed(id, message(e));
    }
  }
  return {runs, state: next};
}
