import {CalendarEvent, CalendarProvider, TimeWindow} from '../src/calendar';
import {CalendarWriter, DeviceEdit} from '../src/push';
import {CalendarSource, DeviceCalendarEditor, initialBridgeState, runBridgeSync, runCalendarModule} from '../src/run';
import {activePlan, defaultSettings, setModule, setProvider} from '../src/settings';
import {DeviceTaskStore, TaskProvider} from '../src/tasks';

const W: TimeWindow = {from: 0, to: 10_000};
const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({eventId: 'e1', calendarId: 'g1', title: 'Talk', content: '', start: 100, end: 200, allDay: false, ...o});
const key = (e: CalendarEvent) => `${e.calendarId}/${e.eventId}`;

function provider(calendarId: string, events: CalendarEvent[]): CalendarProvider {
  return {listCalendars: async () => [{calendarId, name: calendarId}], listEvents: async id => events.filter(e => e.calendarId === id)};
}

/** The tablet: our rows, with the owner's edits laid over them. */
function tablet(edits: DeviceEdit[] = []) {
  const rows = new Map<string, CalendarEvent>();
  const log: string[] = [];
  const store: DeviceCalendarEditor = {
    listOurs: async () => [...rows.values()],
    listEdits: async () => edits,
    create: async e => { rows.set(key(e), e); log.push(`create ${e.title}`); },
    update: async e => { rows.set(key(e), e); log.push(`update ${e.title}`); },
    remove: async (c, id) => { rows.delete(`${c}/${id}`); log.push(`remove ${id}`); },
    relink: async (from, to) => { log.push(`relink ${from.title} ${to.eventId}`); },
  };
  return {store, rows, log};
}

function writer(log: string[]): CalendarWriter {
  return {
    createEvent: async (c, e) => { log.push(`push create ${c} ${e.title}`); return 'g-new'; },
    updateEvent: async e => { log.push(`push update ${e.eventId}`); },
    deleteEvent: async (c, id) => { log.push(`push delete ${id}`); },
  };
}

test('the first pass only pulls; the next pushes the tablet edits before it pulls (#29)', async () => {
  const t = tablet();
  const google: CalendarSource = {id: 'google', provider: provider('g1', [ev()]), writer: writer(t.log)};
  let clock = 1000;
  const first = await runCalendarModule({sources: [google], store: t.store, window: W}, {baseline: []}, () => clock);
  expect(t.log).toEqual(['create Talk']);
  expect(first.state).toEqual({lastSync: 1000, baseline: [ev()]});
  expect(first.run.counts).toEqual({added: 1, changed: 0, removed: 0});

  clock = 2000;
  const edited = tablet([
    {event: ev({title: 'Talk moved', modified: 1500}), cancelled: false},
    {event: ev({eventId: 'old', modified: 900}), cancelled: true}, // before the last sync: not an edit
    {event: ev({eventId: '', title: 'Lunch', modified: 1600}), cancelled: false},
  ]);
  const second = await runCalendarModule({sources: [{...google, writer: writer(edited.log)}], store: edited.store, window: W, defaultCalendarId: 'g1'}, first.state, () => clock, {firstLinked: 1000, sendTabletOnly: false});
  // Lunch was made after the first link (1000), so it is sent with the switch off.
  // The pull then writes the source's rows to this fresh fake tablet, which holds none yet.
  expect(edited.log).toEqual(['push update e1', 'push create g1 Lunch', 'relink Lunch g-new', 'create Talk']);
  expect(second.run.errors).toEqual([]);
  expect(second.state.lastSync).toBe(2000);
});

test('an edit to a read-only source is reported, and a failing source never stops the others', async () => {
  const t = tablet([{event: ev({calendarId: 'feed', modified: 50}), cancelled: false}]);
  const broken: CalendarProvider = {listCalendars: async () => { throw new Error('HTTP 401'); }, listEvents: async () => []};
  const r = await runCalendarModule(
    {sources: [{id: 'ics', provider: provider('feed', [ev({calendarId: 'feed'})])}, {id: 'google', provider: broken}], store: t.store, window: W, takeWarnings: () => ['TZID read as UTC']},
    {lastSync: 10, baseline: []},
    () => 99,
  );
  expect(r.run.errors).toEqual(['google: HTTP 401']);
  expect(r.run.warnings).toEqual(['ics is read-only: 1 edit(s) on the tablet were replaced by the source\'s version', 'TZID read as UTC']);
  expect(t.log).toEqual(['create Talk']);
});

test('runBridgeSync runs only what the plan allows, and a module with no sign-in says so', async () => {
  let s = setModule(defaultSettings(), 'calendar', true);
  s = setModule(s, 'todo', true);
  s = setProvider(s, 'google', true);
  const plan = activePlan(s, {calendar: {available: true, canWrite: true}, todo: {available: true, canWrite: true}});
  const t = tablet();
  const sources: CalendarSource[] = [
    {id: 'google', provider: provider('g1', [ev()])},
    {id: 'icloud', provider: provider('i1', [ev({calendarId: 'i1'})])}, // off in Settings
  ];
  const {runs, state} = await runBridgeSync(plan, {calendar: {sources, store: t.store, window: W}}, initialBridgeState(), () => 5);
  expect(t.log).toEqual(['create Talk']);
  expect(runs.calendar?.counts.added).toBe(1);
  expect(runs.todo).toMatchObject({notRun: true, errors: ['Todoist is not turned on']});
  expect(state.calendar.lastSync).toBe(5);
});

test('a to-do module that is on with no sign-in is not run, and says how to sign in (#88)', async () => {
  let s = setModule(defaultSettings(), 'todo', true);
  s = setProvider(s, 'todoist', true);
  const plan = activePlan(s, {todo: {available: true, canWrite: true}});
  const {runs, state} = await runBridgeSync(plan, {}, initialBridgeState(), () => 3);
  expect(runs.todo).toEqual({
    module: 'todo', at: 3, counts: {added: 0, changed: 0, removed: 0},
    errors: ['Todoist is not signed in: on the Mac, run inkctl secret set todoist'], warnings: [], notRun: true,
  });
  expect(state.firstLinked.todo).toBeUndefined();
});

test('a calendar pass where no source reads is not run, and keeps the tablet edits for the next pass (#88)', async () => {
  const edited = ev({title: 'Moved', modified: 50});
  const t = tablet([{event: edited, cancelled: false}]);
  const broken: CalendarProvider = {listCalendars: async () => { throw new Error('HTTP 401'); }, listEvents: async () => []};
  const log: string[] = [];
  const before = {lastSync: 10, baseline: [ev()]};
  const r = await runCalendarModule(
    {sources: [{id: 'google', provider: broken, writer: writer(log)}], store: t.store, window: W, takeWarnings: () => ['TZID read as UTC']},
    before,
    () => 99,
  );
  expect(r.run).toEqual({
    module: 'calendar', at: 99, counts: {added: 0, changed: 0, removed: 0},
    errors: ['google: HTTP 401'], warnings: ['TZID read as UTC'], notRun: true,
  });
  // The last sync time stays, so the edit is still newer than it when Google reads again.
  expect(r.state).toBe(before);
  expect(t.log).toEqual([]);
  expect(log).toEqual([]);

  let st = setModule(defaultSettings(), 'calendar', true);
  st = setProvider(st, 'google', true);
  const plan = activePlan(st, {calendar: {available: true, canWrite: true}});
  const pass = await runBridgeSync(plan, {calendar: {sources: [{id: 'google', provider: broken}], store: t.store, window: W}}, initialBridgeState(), () => 4);
  expect(pass.runs.calendar?.notRun).toBe(true);
  expect(pass.state.firstLinked.calendar).toBeUndefined();
});

test('a to-do module that throws gets a failed run and keeps its links (#44)', async () => {
  let s = setModule(defaultSettings(), 'todo', true);
  s = setProvider(s, 'todoist', true);
  const plan = activePlan(s, {todo: {available: true, canWrite: true}});
  const provider = {list: async () => { throw new Error('token refused'); }} as unknown as TaskProvider;
  const store = {list: async () => []} as unknown as DeviceTaskStore;
  const links = [{remoteId: 'r', localId: 'l', fingerprint: 'f'}];
  const {runs, state} = await runBridgeSync(plan, {todo: {provider, store}}, {...initialBridgeState(), links}, () => 7);
  expect(runs.todo).toEqual({module: 'todo', at: 7, counts: {added: 0, changed: 0, removed: 0}, errors: ['token refused'], warnings: []});
  expect(state.links).toBe(links);
});
