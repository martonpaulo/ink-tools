import {
  DeviceTask,
  DeviceTaskStore,
  RemoteTask,
  TaskContent,
  TaskLink,
  TaskProvider,
  createTodoistProvider,
  fingerprint,
  fromTodoist,
  syncTasks,
  toTodoistBody,
} from '../src';

const c = (title: string, extra: Partial<TaskContent> = {}): TaskContent => ({title, detail: '', due: null, completed: false, ...extra});

function fakes(remote: RemoteTask[], device: DeviceTask[]) {
  let n = 100;
  const log: string[] = [];
  const provider: TaskProvider = {
    list: async () => remote.filter(t => !t.completed),
    get: async id => remote.find(t => t.remoteId === id) ?? null,
    create: async x => {
      const t = {...x, remoteId: `r${n++}`, modified: 1};
      remote.push(t);
      log.push(`create remote ${x.title}`);
      return t;
    },
    update: async (id, x) => {
      Object.assign(remote.find(t => t.remoteId === id)!, x);
      log.push(`update remote ${x.title}`);
      return remote.find(t => t.remoteId === id)!;
    },
    remove: async id => {
      remote.splice(remote.findIndex(t => t.remoteId === id), 1);
      log.push(`remove remote ${id}`);
    },
  };
  const store: DeviceTaskStore = {
    list: async () => device,
    create: async x => {
      const t = {...x, localId: `l${n++}`, modified: 1, deleted: false};
      device.push(t);
      log.push(`create local ${x.title}`);
      return t;
    },
    update: async (id, x) => {
      Object.assign(device.find(t => t.localId === id)!, x);
      log.push(`update local ${x.title}`);
      return device.find(t => t.localId === id)!;
    },
    remove: async id => {
      device.find(t => t.localId === id)!.deleted = true;
      log.push(`remove local ${id}`);
    },
  };
  return {provider, store, log};
}
const R = (id: string, x: TaskContent, modified = 1): RemoteTask => ({...x, remoteId: id, modified});
const D = (id: string, x: TaskContent, modified = 1): DeviceTask => ({...x, localId: id, modified, deleted: false});
const link = (r: string, l: string, x: TaskContent): TaskLink => ({remoteId: r, localId: l, fingerprint: fingerprint(x)});

test('tasks on one side only are created on the other, and finished ones are not imported', async () => {
  const f = fakes([R('r1', c('from todoist')), R('r2', c('old', {completed: true}))], [D('l1', c('from tablet'))]);
  const out = await syncTasks(f.provider, f.store, []);
  expect(f.log).toEqual(['create local from todoist', 'create remote from tablet']);
  expect(out.links).toHaveLength(2);
  expect(out.errors).toEqual([]);
});

test('a second pass over a synced pair changes nothing', async () => {
  const f = fakes([R('r1', c('a'))], [D('l1', c('a'))]);
  const out = await syncTasks(f.provider, f.store, [link('r1', 'l1', c('a'))]);
  expect(f.log).toEqual([]);
  expect(out.links).toEqual([link('r1', 'l1', c('a'))]);
});

test('a change on one side is copied to the other', async () => {
  const base = c('a');
  const f = fakes([R('r1', c('a', {completed: true}))], [D('l1', base)]);
  await syncTasks(f.provider, f.store, [link('r1', 'l1', base)]);
  expect(f.log).toEqual(['update local a']);
  const g = fakes([R('r1', base)], [D('l1', c('renamed'))]);
  const out = await syncTasks(g.provider, g.store, [link('r1', 'l1', base)]);
  expect(g.log).toEqual(['update remote renamed']);
  expect(out.links[0].fingerprint).toBe(fingerprint(c('renamed')));
});

test('both sides changed: the later change wins and a tie goes to the service', async () => {
  const base = c('a');
  const tablet = fakes([R('r1', c('remote'), 5)], [D('l1', c('device'), 9)]);
  await syncTasks(tablet.provider, tablet.store, [link('r1', 'l1', base)]);
  expect(tablet.log).toEqual(['update remote device']);
  const tie = fakes([R('r1', c('remote'), 5)], [D('l1', c('device'), 5)]);
  await syncTasks(tie.provider, tie.store, [link('r1', 'l1', base)]);
  expect(tie.log).toEqual(['update local remote']);
});

test('a deletion on either side propagates, and a completed remote task is not a deletion', async () => {
  const base = c('a');
  const gone = fakes([], [D('l1', base)]);
  const out = await syncTasks(gone.provider, gone.store, [link('r1', 'l1', base)]);
  expect(gone.log).toEqual(['remove local l1']);
  expect(out.links).toEqual([]);

  const dev = D('l1', base);
  dev.deleted = true;
  const del = fakes([R('r1', base)], [dev]);
  await syncTasks(del.provider, del.store, [link('r1', 'l1', base)]);
  expect(del.log).toEqual(['remove remote r1']);

  const done = fakes([R('r1', c('a', {completed: true}))], [D('l1', base)]);
  await syncTasks(done.provider, done.store, [link('r1', 'l1', base)]);
  expect(done.log).toEqual(['update local a']);
});

test('an empty device list removes nothing from the service and reports an error (#69)', async () => {
  const base = c('a');
  const f = fakes([R('r1', base), R('r2', c('b'))], []);
  const links = [link('r1', 'l1', base), link('r2', 'l2', c('b'))];
  const out = await syncTasks(f.provider, f.store, links);
  expect(f.log).toEqual([]);
  expect(out.counts.removedRemote).toBe(0);
  expect(out.links).toEqual(links);
  expect(out.errors).toHaveLength(2);
});

test('one failing task is reported and kept for the next pass, the others still sync', async () => {
  const base = c('a');
  const f = fakes([R('r1', c('a2')), R('r2', c('b'))], [D('l1', base)]);
  f.store.update = async () => {
    throw new Error('provider rejected');
  };
  const out = await syncTasks(f.provider, f.store, [link('r1', 'l1', base)]);
  expect(out.errors[0]).toMatch(/provider rejected/);
  expect(out.links[0]).toEqual(link('r1', 'l1', base));
  expect(f.log).toEqual(['create local b']);
});

describe('todoist', () => {
  const task = {id: '7', content: 'Buy milk', description: 'two', checked: false, due: {datetime: '2026-11-20T10:00:00Z'}, updated_at: '2026-11-14T00:00:00Z'};

  test('maps a task and builds the body', () => {
    expect(fromTodoist(task)).toEqual({remoteId: '7', title: 'Buy milk', detail: 'two', due: Date.parse('2026-11-20T10:00:00Z'), completed: false, modified: Date.parse('2026-11-14T00:00:00Z')});
    expect(fromTodoist({id: '8', content: 'x', due: {date: '2026-11-20'}}).due).toBe(Date.parse('2026-11-20T00:00:00Z'));
    expect(toTodoistBody(c('x', {due: Date.parse('2026-11-20T10:00:00Z')}))).toMatchObject({due_datetime: '2026-11-20T10:00:00Z'});
    expect(toTodoistBody(c('x'))).toMatchObject({due_string: 'no date'});
  });

  test('pages through the list, sends the token and closes a completed task', async () => {
    const calls: string[] = [];
    const provider = createTodoistProvider({
      token: 'test-token',
      fetch: async (url, init) => {
        calls.push(`${init.method} ${url}`);
        expect(init.headers.Authorization).toBe('Bearer test-token');
        const body = url.endsWith('/tasks') && init.method === 'GET' ? {results: [task], next_cursor: 'c2'} : url.includes('cursor=') ? {results: [{...task, id: '9'}]} : task;
        return {ok: true, status: 200, json: async () => body, text: async () => ''};
      },
    });
    expect((await provider.list()).map(t => t.remoteId)).toEqual(['7', '9']);
    await provider.update('7', c('Buy milk', {completed: true}));
    expect(calls).toContain('POST https://api.todoist.com/api/v1/tasks/7/close');
  });

  test('a 404 means the task is gone and any other failure throws', async () => {
    const respond = (status: number) =>
      createTodoistProvider({fetch: async () => ({ok: status < 400, status, json: async () => ({}), text: async () => ''}), token: 't'});
    expect(await respond(404).get('1')).toBeNull();
    await expect(respond(500).get('1')).rejects.toThrow(/HTTP 500/);
  });
});

import {
  CalendarEvent,
  CalendarProvider,
  DeviceCalendarStore,
  createGoogleCalendarProvider,
  fromGoogleEvent,
  pollDeviceCode,
  startDeviceCode,
  syncCalendar,
} from '../src';

const ev = (id: string, title = id, cal = 'c1', extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  eventId: id, calendarId: cal, title, content: '', start: 10, end: 20, allDay: false, ...extra,
});
const W = {from: 0, to: 100};

function calFakes(remote: Record<string, CalendarEvent[] | Error>, device: CalendarEvent[]) {
  const log: string[] = [];
  const provider: CalendarProvider = {
    listCalendars: async () => Object.keys(remote).map(id => ({calendarId: id, name: id})),
    listEvents: async id => {
      const r = remote[id];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  const store: DeviceCalendarStore = {
    listOurs: async () => device,
    create: async e => void log.push(`create ${e.eventId}`),
    update: async e => void log.push(`update ${e.eventId}`),
    remove: async (c, id) => void log.push(`remove ${c}/${id}`),
  };
  return {provider, store, log};
}

describe('calendar sync', () => {
  test('adds, updates and removes to match the provider', async () => {
    const f = calFakes({c1: [ev('new'), ev('same'), ev('changed', 'renamed')]}, [ev('same'), ev('changed'), ev('gone')]);
    const out = await syncCalendar(f.provider, f.store, W);
    expect(f.log.sort()).toEqual(['create new', 'remove c1/gone', 'update changed']);
    expect(out).toMatchObject({created: 1, updated: 1, removed: 1, errors: []});
  });

  test('a calendar that fails to read keeps its rows; the others still sync', async () => {
    const f = calFakes({c1: new Error('HTTP 500'), c2: [ev('x', 'x', 'c2')]}, [ev('keep', 'keep', 'c1')]);
    const out = await syncCalendar(f.provider, f.store, W);
    expect(f.log).toEqual(['create x']);
    expect(out.errors[0]).toMatch(/c1: HTTP 500/);
  });

  test('a calendar that is switched off is not read and its rows are left alone', async () => {
    const f = calFakes({c1: [ev('a')], c2: [ev('b', 'b', 'c2')]}, [ev('old', 'old', 'c2')]);
    await syncCalendar(f.provider, f.store, W, ['c1']);
    expect(f.log).toEqual(['create a']);
  });
});

describe('google', () => {
  test('maps timed, all-day and cancelled events', () => {
    expect(fromGoogleEvent('c', {id: 'a', summary: 'Hi', start: {dateTime: '2026-11-20T10:00:00Z'}, end: {dateTime: '2026-11-20T11:00:00Z'}})).toMatchObject({title: 'Hi', allDay: false, end: Date.parse('2026-11-20T11:00:00Z')});
    expect(fromGoogleEvent('c', {id: 'b', start: {date: '2026-11-20'}, end: {date: '2026-11-21'}})).toMatchObject({allDay: true, title: '(no title)'});
    expect(fromGoogleEvent('c', {id: 'c', status: 'cancelled', start: {date: '2026-11-20'}, end: {date: '2026-11-21'}})).toBeNull();
  });

  test('lists every calendar and expanded events across pages with the token', async () => {
    const urls: string[] = [];
    const fetch = async (url: string, init: {headers: Record<string, string>}) => {
      urls.push(url);
      expect(init.headers.Authorization).toBe('Bearer tok');
      const body = url.includes('calendarList')
        ? {items: [{id: 'c1', summary: 'Work'}, {id: 'c2', summaryOverride: 'Home'}]}
        : url.includes('pageToken')
          ? {items: [{id: 'e2', start: {date: '2026-11-20'}, end: {date: '2026-11-21'}}]}
          : {items: [{id: 'e1', start: {date: '2026-11-20'}, end: {date: '2026-11-21'}}], nextPageToken: 'p2'};
      return {ok: true, status: 200, json: async () => body};
    };
    const p = createGoogleCalendarProvider(fetch as never, async () => 'tok');
    expect((await p.listCalendars()).map(c => c.name)).toEqual(['Work', 'Home']);
    expect((await p.listEvents('c1', W)).map(e => e.eventId)).toEqual(['e1', 'e2']);
    expect(urls[1]).toContain('singleEvents=true');
  });

  test('device-code sign-in: prompt, pending, granted, and a hard error throws', async () => {
    const client = {clientId: 'id', clientSecret: 's'};
    const reply = (status: number, body: unknown) => (async () => ({ok: status < 400, status, json: async () => body})) as never;
    const prompt = await startDeviceCode(reply(200, {device_code: 'dc', user_code: 'AB-12', verification_url: 'https://google.com/device', expires_in: 1800}), client);
    expect(prompt).toMatchObject({userCode: 'AB-12', intervalSeconds: 5});
    expect(await pollDeviceCode(reply(428, {error: 'authorization_pending'}), client, 'dc')).toEqual({status: 'pending'});
    expect(await pollDeviceCode(reply(403, {error: 'access_denied'}), client, 'dc')).toEqual({status: 'denied'});
    expect(await pollDeviceCode(reply(200, {access_token: 'a', refresh_token: 'r'}), client, 'dc')).toMatchObject({status: 'granted', refreshToken: 'r'});
    await expect(pollDeviceCode(reply(400, {error: 'invalid_client'}), client, 'dc')).rejects.toThrow(/invalid_client/);
  });
});

import {createCalDavProvider, createIcsProvider, expandEvents, httpsUrl, parseIcs} from '../src';

const ics = (body: string | string[]) => `BEGIN:VCALENDAR\r\n${([] as string[]).concat(body).join('\r\n')}\r\nEND:VCALENDAR`;
const vevent = (lines: string[]) => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT`;
const WIDE = {from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 11, 31)};

describe('ics', () => {
  test('parses a timed event with folded and escaped text, and an all-day event', () => {
    const {events} = parseIcs(ics([
      vevent(['UID:a', 'SUMMARY:Lunch\\, with a very long', ' name', 'DTSTART:20261120T120000Z', 'DTEND:20261120T130000Z']),
      vevent(['UID:b', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261125']),
    ]));
    expect(events[0]).toMatchObject({title: 'Lunch, with a very longname', start: Date.UTC(2026, 10, 20, 12), end: Date.UTC(2026, 10, 20, 13)});
    expect(events[1]).toMatchObject({allDay: true, end: Date.UTC(2026, 10, 26)});
  });

  test('a cancelled event is dropped', () => {
    expect(parseIcs(ics(vevent(['UID:c', 'STATUS:CANCELLED', 'DTSTART:20261120T120000Z']))).events).toEqual([]);
  });

  test('expands weekly COUNT with BYDAY, INTERVAL, EXDATE and one overridden occurrence', () => {
    const {events} = parseIcs(ics([
      vevent(['UID:w', 'SUMMARY:Gym', 'DTSTART:20260105T070000Z', 'DTEND:20260105T080000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6', 'EXDATE:20260107T070000Z']),
      vevent(['UID:w', 'SUMMARY:Gym (moved)', 'RECURRENCE-ID:20260112T070000Z', 'DTSTART:20260112T090000Z', 'DTEND:20260112T100000Z']),
    ]));
    const out = expandEvents('c', events, WIDE);
    expect(out.map(e => new Date(e.start).toISOString().slice(5, 16))).toEqual(['01-05T07:00', '01-12T09:00', '01-14T07:00', '01-19T07:00', '01-21T07:00']);
    expect(out[1].title).toBe('Gym (moved)');
    expect(new Set(out.map(e => e.eventId)).size).toBe(5);
  });

  test('expands daily, monthly (skipping short months) and yearly until UNTIL or the window end', () => {
    const one = (rule: string, start = '20260131T100000Z') => expandEvents('c', parseIcs(ics(vevent(['UID:r', `DTSTART:${start}`, 'DTEND:' + start, rule]))).events, {from: 0, to: Date.UTC(2026, 5, 1)});
    expect(one('RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20260106T000000Z', '20260101T100000Z')).toHaveLength(3);
    expect(one('RRULE:FREQ=MONTHLY').map(e => new Date(e.start).getUTCMonth() + 1)).toEqual([1, 3, 5]);
    expect(one('RRULE:FREQ=YEARLY', '20250310T100000Z').map(e => new Date(e.start).getUTCFullYear())).toEqual([2025, 2026]);
  });

  test('a cancelled single occurrence of a series does not reappear (#60)', () => {
    const {events} = parseIcs(ics([
      vevent(['UID:s', 'DTSTART:20261102T100000Z', 'DTEND:20261102T110000Z', 'RRULE:FREQ=DAILY;COUNT=3']),
      vevent(['UID:s', 'RECURRENCE-ID:20261103T100000Z', 'DTSTART:20261103T100000Z', 'DTEND:20261103T110000Z', 'STATUS:CANCELLED']),
    ]));
    expect(expandEvents('c', events, WIDE).map(e => new Date(e.start).getUTCDate())).toEqual([2, 4]);
  });

  test('an all-day event ending at the window start is outside it, a zero-length one at the start is inside (#62)', () => {
    const day3 = Date.UTC(2026, 10, 3);
    const allDay = parseIcs(ics(vevent(['UID:d', 'DTSTART;VALUE=DATE:20261102']))).events;
    expect(expandEvents('c', allDay, {from: day3, to: day3 + 86400000})).toHaveLength(0);
    expect(expandEvents('c', allDay, {from: day3 - 1, to: day3 + 86400000})).toHaveLength(1);
    const instant = parseIcs(ics(vevent(['UID:i', 'DTSTART:20261103T000000Z']))).events;
    expect(expandEvents('c', instant, {from: day3, to: day3 + 86400000})).toHaveLength(1);
  });

  test('an unsupported rule keeps the first occurrence and warns', () => {
    const warnings: string[] = [];
    const {events} = parseIcs(ics(vevent(['UID:x', 'DTSTART:20260105T070000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU'])));
    expect(expandEvents('c', events, WIDE, warnings)).toHaveLength(1);
    expect(warnings[0]).toMatch(/unsupported/);
  });

  test('the ICS provider upgrades webcal:// and reads each feed as its own calendar', async () => {
    const urls: string[] = [];
    const p = createIcsProvider(async u => (urls.push(u), ics(vevent(['UID:f', 'SUMMARY:Match', 'DTSTART:20260301T180000Z', 'DTEND:20260301T200000Z']))), [{id: 'f1', name: 'Team', url: 'webcal://example.com/team.ics'}]);
    expect((await p.listCalendars())[0].name).toBe('Team');
    expect((await p.listEvents('f1', WIDE))[0].title).toBe('Match');
    expect(urls).toEqual(['https://example.com/team.ics']);
    expect(httpsUrl('WEBCAL://x')).toBe('https://x');
    await expect(p.listEvents('nope', WIDE)).rejects.toThrow(/unknown/);
  });

  test('CalDAV sends a basic-auth REPORT and parses the calendar-data of a multistatus reply', async () => {
    const seen: {method: string; auth: string; body?: string}[] = [];
    const xml = `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:propstat><d:prop><c:calendar-data>${vevent(['UID:k', 'SUMMARY:Tom &amp; Jerry', 'DTSTART:20260401T100000Z', 'DTEND:20260401T110000Z']).replace(/^/, 'BEGIN:VCALENDAR\r\n').concat('\r\nEND:VCALENDAR')}</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;
    const p = createCalDavProvider({
      fetch: (async (_u: string, init: {method: string; headers: Record<string, string>; body?: string}) => {
        seen.push({method: init.method, auth: init.headers.Authorization, body: init.body});
        return {ok: true, status: 207, json: async () => ({}), text: async () => xml};
      }) as never,
      calendars: [{id: 'home', name: 'Home', url: 'https://caldav.example.com/home/'}],
      username: 'u',
      getPassword: async () => 'fixture-pw',
      basicAuth: (u, pw) => `${u}:${pw}`,
    });
    const out = await p.listEvents('home', WIDE);
    expect(out[0]).toMatchObject({title: 'Tom & Jerry', eventId: 'k'});
    expect(seen[0]).toMatchObject({method: 'REPORT', auth: 'Basic u:fixture-pw'});
    expect(seen[0].body).toContain('time-range start="20260101T000000Z"');
  });
});
