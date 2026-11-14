import {CalendarEvent} from '../src/calendar';
import {CalendarWriter, createGoogleCalendarWriter, pushCalendarEdits, toGoogleBody} from '../src/push';

const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({
  eventId: 'e1', calendarId: 'c1', title: 'Talk', content: '', start: Date.UTC(2026, 10, 14, 9), end: Date.UTC(2026, 10, 14, 10), allDay: false, ...o,
});

function fakeWriter() {
  const calls: string[] = [];
  const w: CalendarWriter = {
    createEvent: async (c, e) => { calls.push(`create ${c} ${e.title}`); return 'new1'; },
    updateEvent: async e => { calls.push(`update ${e.eventId}`); },
    deleteEvent: async (c, id) => { calls.push(`delete ${c}/${id}`); },
  };
  return {w, calls};
}

test('changed rows update, hidden rows delete, unchanged rows are skipped', async () => {
  const {w, calls} = fakeWriter();
  const r = await pushCalendarEdits(
    [{event: ev({title: 'Talk 2'}), cancelled: false}, {event: ev({eventId: 'e2'}), cancelled: true}, {event: ev({eventId: 'e3'}), cancelled: false}],
    [ev(), ev({eventId: 'e3'})],
    w,
  );
  expect(calls).toEqual(['update e1', 'delete c1/e2']);
  expect(r).toMatchObject({updated: 1, deleted: 1, skipped: 1, errors: []});
});

test('a tablet-created event goes to the default calendar; without one it is reported, never dropped', async () => {
  const {w, calls} = fakeWriter();
  const fresh = {event: ev({eventId: '', title: 'New'}), cancelled: false};
  const ok = await pushCalendarEdits([fresh], [], w, 'work');
  expect(calls).toEqual(['create work New']);
  expect(ok.created[0].eventId).toBe('new1');
  const none = await pushCalendarEdits([fresh], [], w);
  expect(none.errors[0]).toMatch(/no default calendar/);
  expect(none.created).toEqual([]);
});

test('one failing edit is reported and the rest still push', async () => {
  const {w} = fakeWriter();
  w.updateEvent = async e => { if (e.eventId === 'e1') throw new Error('boom'); };
  const r = await pushCalendarEdits([{event: ev({title: 'x'}), cancelled: false}, {event: ev({eventId: 'e2'}), cancelled: true}], [ev()], w);
  expect(r.errors).toEqual(['c1/e1: boom']);
  expect(r.deleted).toBe(1);
});

test('Google bodies: timed events use dateTime, all-day events use date', () => {
  expect(toGoogleBody(ev())).toMatchObject({summary: 'Talk', start: {dateTime: '2026-11-14T09:00:00.000Z'}});
  expect(toGoogleBody(ev({allDay: true, start: Date.UTC(2026, 10, 14), end: Date.UTC(2026, 10, 15)}))).toMatchObject({
    start: {date: '2026-11-14'}, end: {date: '2026-11-15'},
  });
});

test('Google writer sends POST, PATCH and DELETE; a delete of a gone event succeeds', async () => {
  const seen: string[] = [];
  const status = {n: 200};
  const fetch = async (url: string, init: {method: string}) => {
    seen.push(`${init.method} ${url.replace('https://www.googleapis.com/calendar/v3', '')}`);
    return {ok: status.n < 300, status: status.n, json: async () => ({id: 'g9'})};
  };
  const w = createGoogleCalendarWriter(fetch, async () => 't');
  expect(await w.createEvent('a@b', ev())).toBe('g9');
  await w.updateEvent(ev({eventId: 'e_20261114'}));
  status.n = 410;
  await w.deleteEvent('c1', 'e1');
  expect(seen).toEqual(['POST /calendars/a%40b/events', 'PATCH /calendars/c1/events/e_20261114', 'DELETE /calendars/c1/events/e1']);
  status.n = 403;
  await expect(w.deleteEvent('c1', 'e1')).rejects.toThrow(/HTTP 403/);
});
