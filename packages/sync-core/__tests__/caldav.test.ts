import {CalendarEvent} from '../src/calendar';
import {createCalDavWriter, discoverCalDavCalendars, foldLine} from '../src/caldav';
import {basicCredentials} from '../src/http';
import {HttpInit} from '../src/http';
import {expandEvents, parseIcs, unfold} from '../src/ics';

const BASE = 'https://caldav.example.com/123/calendars/home/';
const HOUR = 3600000;

const ics = (...events: string[][]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap(e => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

const answer = (href: string, etag: string, data: string) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>${href}</d:href><d:propstat><d:prop><d:getetag>&quot;${etag}&quot;</d:getetag><c:calendar-data>${data.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;
const EMPTY = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>';

/** A fake server: one resource per UID; records every request. */
function server(resources: Record<string, string>, status: Partial<Record<string, number>> = {}) {
  const calls: Array<{url: string; init: HttpInit}> = [];
  const fetch = async (url: string, init: HttpInit) => {
    calls.push({url, init});
    const reply = (code: number, text = '') => ({ok: code < 300, status: code, text: async () => text});
    if (init.method === 'REPORT') {
      const uid = /<c:text-match[^>]*>([^<]*)</.exec(init.body ?? '')![1];
      const data = resources[uid];
      return reply(207, data === undefined ? EMPTY : answer(`/123/calendars/home/${uid}.ics`, 'v1', data));
    }
    return reply(status[init.method] ?? 204);
  };
  const writer = createCalDavWriter({
    fetch,
    calendars: [{id: 'home', name: 'Home', url: BASE}],
    username: 'tester',
    getPassword: async () => 'app-password',
    basicAuth: (u, p) => `${u}:${p}`,
    newUid: () => 'new-uid',
    now: () => Date.UTC(2026, 10, 16, 12),
  });
  const written = () => calls.filter(c => c.init.method === 'PUT').map(c => c.init.body!);
  return {writer, calls, written};
}

const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({
  eventId: 'uid-a', calendarId: 'home', title: 'Talk', content: '', start: Date.UTC(2026, 10, 20, 9), end: Date.UTC(2026, 10, 20, 10), allDay: false, ...o,
});

const SINGLE = ics(['UID:uid-a', 'DTSTART:20261120T090000Z', 'DTEND:20261120T100000Z', 'SUMMARY:Talk', 'LOCATION:Room 4', 'SEQUENCE:2',
  'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM']);
const SERIES = ics(['UID:s1', 'DTSTART;TZID=Europe/Madrid:20261116T090000', 'DTEND;TZID=Europe/Madrid:20261116T100000', 'RRULE:FREQ=DAILY;COUNT=5', 'SUMMARY:Standup']);

test('a tablet-made event is created under a new name and never overwrites one (#30)', async () => {
  const {writer, calls} = server({});
  expect(await writer.createEvent('home', ev({eventId: '', title: 'Lunch, with team'}))).toBe('new-uid');
  const put = calls[0];
  expect(put.url).toBe(`${BASE}new-uid.ics`);
  expect(put.init.headers['If-None-Match']).toBe('*');
  expect(put.init.headers.Authorization).toBe('Basic tester:app-password');
  const [made] = parseIcs(put.init.body!).events;
  expect(made).toMatchObject({uid: 'new-uid', title: 'Lunch, with team', start: Date.UTC(2026, 10, 20, 9), end: Date.UTC(2026, 10, 20, 10)});
});

test('an edit changes only the owned lines and keeps the alarm, the location and the ETag guard', async () => {
  const {writer, calls, written} = server({'uid-a': SINGLE});
  await writer.updateEvent(ev({title: 'Talk moved', content: 'Line 1\nLine 2', start: Date.UTC(2026, 10, 20, 11), end: Date.UTC(2026, 10, 20, 12)}));
  const put = calls.find(c => c.init.method === 'PUT')!;
  expect(put.url).toBe('https://caldav.example.com/123/calendars/home/uid-a.ics');
  expect(put.init.headers['If-Match']).toBe('"v1"');
  const body = written()[0];
  expect(body).toContain('LOCATION:Room 4');
  expect(body).toContain('SEQUENCE:3');
  expect(body).toContain('DESCRIPTION:Reminder'); // the alarm's own line stays
  const [e] = parseIcs(body).events;
  expect(e).toMatchObject({title: 'Talk moved', content: 'Line 1\nLine 2', start: Date.UTC(2026, 10, 20, 11), end: Date.UTC(2026, 10, 20, 12)});
});

test('an edit to one occurrence adds a RECURRENCE-ID override in the series time form, never a series change', async () => {
  const {writer, written} = server({s1: SERIES});
  const occurrence = Date.UTC(2026, 10, 18, 9);
  await writer.updateEvent(ev({eventId: `s1@${occurrence}`, title: 'Standup late', start: occurrence + HOUR, end: occurrence + 2 * HOUR}));
  const body = written()[0];
  expect(body).toContain('RECURRENCE-ID;TZID=Europe/Madrid:20261118T090000');
  expect(body).toContain('RRULE:FREQ=DAILY;COUNT=5');
  const days = expandEvents('home', parseIcs(body).events, {from: Date.UTC(2026, 10, 16), to: Date.UTC(2026, 10, 30)}, []);
  expect(days.map(d => d.title)).toEqual(['Standup', 'Standup', 'Standup late', 'Standup', 'Standup']);
  expect(days[2].start).toBe(occurrence + HOUR);
});

test('a hidden occurrence becomes an EXDATE; a hidden single event is deleted with its ETag', async () => {
  const occurrence = Date.UTC(2026, 10, 17, 9);
  const series = server({s1: SERIES});
  await series.writer.deleteEvent('home', `s1@${occurrence}`);
  const body = series.written()[0];
  expect(body).toContain('EXDATE;TZID=Europe/Madrid:20261117T090000');
  expect(expandEvents('home', parseIcs(body).events, {from: Date.UTC(2026, 10, 16), to: Date.UTC(2026, 10, 30)}, [])).toHaveLength(4);

  const single = server({'uid-a': SINGLE});
  await single.writer.deleteEvent('home', 'uid-a');
  const del = single.calls.find(c => c.init.method === 'DELETE')!;
  expect(del.init.headers['If-Match']).toBe('"v1"');
  expect(single.written()).toEqual([]);
});

test('a UID that holds an @ and digits is read as itself when no series has that UID', async () => {
  const {writer, calls} = server({'meeting@2026': SINGLE.replace('UID:uid-a', 'UID:meeting@2026')});
  await writer.deleteEvent('home', 'meeting@2026');
  expect(calls.map(c => c.init.method)).toEqual(['REPORT', 'REPORT', 'DELETE']);
});

test('a change made on iCloud in between fails the write; a gone event counts as deleted', async () => {
  const changed = server({'uid-a': SINGLE}, {PUT: 412});
  await expect(changed.writer.updateEvent(ev())).rejects.toThrow(/changed on iCloud/);
  const gone = server({});
  await expect(gone.writer.deleteEvent('home', 'uid-a')).resolves.toBeUndefined();
  await expect(gone.writer.updateEvent(ev())).rejects.toThrow(/not on iCloud/);
});

test('long lines fold at 75 octets, counting multibyte characters, and unfold back', () => {
  const line = `SUMMARY:${'é'.repeat(80)}`;
  const folded = foldLine(line);
  for (const part of folded.split('\r\n')) expect(unescape(encodeURIComponent(part)).length).toBeLessThanOrEqual(75);
  expect(unfold(folded)).toEqual([line]);
});

describe('CalDAV discovery (#30)', () => {
  const ROOT = 'https://caldav.example.com/';
  const ms = (...responses: string[]) =>
    `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${responses.join('')}</d:multistatus>`;
  const resp = (href: string, props: string, status = 'HTTP/1.1 200 OK') =>
    `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>${status}</d:status></d:propstat></d:response>`;
  const cal = (href: string, name: string, comps: string[] | null, type = '<d:collection/><c:calendar/>') =>
    resp(href, `<d:resourcetype>${type}</d:resourcetype><d:displayname>${name}</d:displayname>${
      comps ? `<c:supported-calendar-component-set>${comps.map(c => `<c:comp name="${c}"/>`).join('')}</c:supported-calendar-component-set>` : ''}`);

  function davServer(answers: Record<string, string>, status: Record<string, number> = {}) {
    const calls: Array<{url: string; init: HttpInit}> = [];
    const fetch = async (url: string, init: HttpInit) => {
      calls.push({url, init});
      const code = status[url] ?? (answers[url] === undefined ? 404 : 207);
      return {ok: code < 300, status: code, text: async () => answers[url] ?? ''};
    };
    const found = () => discoverCalDavCalendars({fetch, root: ROOT, username: 'tester', getPassword: async () => 'app-password', basicAuth: (u, p) => `${u}:${p}`});
    return {calls, found};
  }

  const HOME = 'https://p01-caldav.example.com:443/123/calendars/';
  const ANSWERS = {
    [ROOT]: ms(resp('/', '<d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal>')),
    'https://caldav.example.com/123/principal/': ms(resp('/123/principal/', `<c:calendar-home-set><d:href>${HOME}</d:href></c:calendar-home-set>`)),
    [HOME]: ms(
      resp('/123/calendars/', '<d:resourcetype><d:collection/></d:resourcetype>'),
      cal('/123/calendars/home/', 'Home &amp; family', ['VEVENT']),
      cal('/123/calendars/work/', 'Work', null),
      cal('/123/calendars/tasks/', 'Reminders', ['VTODO']),
      cal('/123/calendars/inbox/', 'Inbox', null, '<d:collection/><c:schedule-inbox/>'),
      cal('/123/calendars/holidays/', 'Holidays', ['VEVENT'], '<d:collection/><cs:subscribed xmlns:cs="http://calendarserver.org/ns/"/>'),
      resp('/123/calendars/gone/', '<d:displayname/>', 'HTTP/1.1 404 Not Found'),
    ),
  };

  test('finds the principal, the home and only the event calendars, named and keyed by URL', async () => {
    const {calls, found} = davServer(ANSWERS);
    expect(await found()).toEqual([
      {id: 'https://p01-caldav.example.com:443/123/calendars/home/', name: 'Home & family', url: 'https://p01-caldav.example.com:443/123/calendars/home/'},
      {id: 'https://p01-caldav.example.com:443/123/calendars/work/', name: 'Work', url: 'https://p01-caldav.example.com:443/123/calendars/work/'},
    ]);
    expect(calls.map(c => [c.init.method, c.init.headers.Depth])).toEqual([['PROPFIND', '0'], ['PROPFIND', '0'], ['PROPFIND', '1']]);
    expect(calls[0].init.headers.Authorization).toBe('Basic tester:app-password');
    expect(calls[0].init.body).toContain('current-user-principal');
  });

  test('a refused sign-in names the Apple ID and password; a missing principal fails, never an empty list', async () => {
    await expect(davServer(ANSWERS, {[ROOT]: 401}).found()).rejects.toThrow('HTTP 401');
    await expect(davServer({...ANSWERS, [ROOT]: ms(resp('/', '<d:current-user-principal/>', 'HTTP/1.1 404 Not Found'))}).found())
      .rejects.toThrow('no current-user-principal');
  });

  test('an http root is refused before any request', async () => {
    const calls: unknown[] = [];
    await expect(discoverCalDavCalendars({
      fetch: async () => { calls.push(1); return {ok: true, status: 207, text: async () => ''}; },
      root: 'http://caldav.example.com/', username: 'u', getPassword: async () => 'p', basicAuth: () => 'x',
    })).rejects.toThrow('https');
    expect(calls).toHaveLength(0);
  });
});

test('Basic credentials are RFC 7617 base64 of the UTF-8 pair (#30)', () => {
  expect(basicCredentials('Aladdin', 'open sesame')).toBe('QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
  expect(basicCredentials('a', 'b')).toBe('YTpi');
  expect(basicCredentials('ab', 'c')).toBe('YWI6Yw==');
  expect(basicCredentials('tést', 'ü€')).toBe('dMOpc3Q6w7zigqw=');
});
