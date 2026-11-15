/**
 * An event changed on the tablet and at the source between two syncs (#87, owner D14 A): the later
 * change wins, a tie or an unknown time goes to the source, and the losing text reaches the status.
 */
import {CalendarEvent, CalendarProvider, DeviceCalendarStore, syncCalendar} from '../src/calendar';
import {CalendarWriter, conflictWarnings, pushCalendarEdits} from '../src/push';
import {calendarRun} from '../src/status';
import {fromGoogleEvent} from '../src/google';

const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({
  eventId: 'e1', calendarId: 'c1', title: 'Dentist', content: '', start: Date.UTC(2026, 10, 20, 9), end: Date.UTC(2026, 10, 20, 10), allDay: false, ...o,
});
const window = {from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 11, 1)};

/** The tablet's row, the source's event and the last pull's baseline, then push and pull in order. */
async function sync(tablet: CalendarEvent, source: CalendarEvent, baseline = ev()) {
  const pushed: string[] = [];
  const writer: CalendarWriter = {
    createEvent: async () => 'new',
    updateEvent: async e => { pushed.push(e.title); },
    deleteEvent: async () => undefined,
  };
  const push = await pushCalendarEdits([{event: tablet, cancelled: false}], [baseline], writer, undefined, [source]);
  const sourceAfter = pushed.length ? {...tablet} : source;
  const written: string[] = [];
  const store: DeviceCalendarStore = {
    listOurs: async () => [tablet],
    create: async () => undefined,
    update: async e => { written.push(e.title); },
    remove: async () => undefined,
  };
  const provider: CalendarProvider = {
    listCalendars: async () => [{calendarId: 'c1', name: 'Work'}],
    listEvents: async () => [sourceAfter],
  };
  const pull = await syncCalendar(provider, store, window);
  return {push, pushed, written, pull};
}

test('the source changed later: its version stays, the tablet edit is kept in the status', async () => {
  const r = await sync(ev({title: 'Dentist 10h', modified: 2000}), ev({title: 'Dentist moved', modified: 3000}));
  expect(r.pushed).toEqual([]);
  expect(r.written).toEqual(['Dentist moved']);
  expect(r.push.conflicts).toEqual([{kept: 'source', lost: ev({title: 'Dentist 10h', modified: 2000})}]);
  const run = calendarRun(5, r.pull, conflictWarnings(r.push.conflicts));
  expect(run.warnings).toEqual([
    `Changed on both sides: kept the source's version; the tablet's was "Dentist 10h" at 2026-11-20T09:00:00.000Z`,
  ]);
});

test('the tablet changed later: its edit is pushed and the source version is kept in the status', async () => {
  const r = await sync(ev({title: 'Dentist 10h', modified: 4000}), ev({title: 'Dentist moved', content: 'room 2', modified: 3000}));
  expect(r.pushed).toEqual(['Dentist 10h']);
  expect(r.written).toEqual([]);
  expect(conflictWarnings(r.push.conflicts)).toEqual([
    `Changed on both sides: kept the tablet's version; the source's was "Dentist moved" at 2026-11-20T09:00:00.000Z, notes "room 2"`,
  ]);
});

test('a tie, or a source with no change time (ICS), goes to the source', async () => {
  for (const source of [ev({title: 'Dentist moved', modified: 4000}), ev({title: 'Dentist moved'})]) {
    const r = await sync(ev({title: 'Dentist 10h', modified: 4000}), source);
    expect(r.pushed).toEqual([]);
    expect(r.push.conflicts.map(c => c.kept)).toEqual(['source']);
  }
});

test('a change on the tablet only is pushed with no conflict', async () => {
  const r = await sync(ev({title: 'Dentist 10h', modified: 2000}), ev({modified: 1000}));
  expect(r.pushed).toEqual(['Dentist 10h']);
  expect(r.push.conflicts).toEqual([]);
});

test("Google's updated time is the source's change time", () => {
  const google = {id: 'e1', start: {dateTime: '2026-11-20T09:00:00Z'}, end: {dateTime: '2026-11-20T10:00:00Z'}};
  expect(fromGoogleEvent('c1', {...google, updated: '2026-11-19T08:00:00Z'})?.modified).toBe(Date.UTC(2026, 10, 19, 8));
  expect(fromGoogleEvent('c1', google)).not.toHaveProperty('modified');
});
