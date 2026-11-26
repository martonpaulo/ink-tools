import {runTodoModule} from '../src/run';
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
  PULL_ONLY,
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
  const out = await syncTasks(f.provider, f.store, [], {sendTabletOnly: true});
  expect(f.log).toEqual(['create local from todoist', 'create remote from tablet']);
  expect(out.links).toHaveLength(2);
  expect(out.errors).toEqual([]);
});

test('a pulled task reaches the tablet store with its service list (#212)', async () => {
  const f = fakes([{...R('r1', c('stretch')), list: {name: 'Habits', inbox: false}}, R('r2', c('loose'))], []);
  const lists: unknown[] = [];
  const create = f.store.create;
  f.store.create = async (x, list) => (lists.push(list), create(x, list));
  await syncTasks(f.provider, f.store, []);
  expect(lists).toEqual([{name: 'Habits', inbox: false}, undefined]);
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
  const won = await syncTasks(tablet.provider, tablet.store, [link('r1', 'l1', base)]);
  expect(tablet.log).toEqual(['update remote device']);
  // The losing version's title reaches the run's warnings (#87).
  expect(won.warnings).toEqual([`Changed on both sides: kept the tablet's version; the service's was "remote"`]);
  const tie = fakes([R('r1', c('remote'), 5)], [D('l1', c('device'), 5)]);
  const lost = await syncTasks(tie.provider, tie.store, [link('r1', 'l1', base)]);
  expect(tie.log).toEqual(['update local remote']);
  expect(lost.warnings).toEqual([`Changed on both sides: kept the service's version; the tablet's was "device"`]);
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

test('a finished, unchanged task costs no request and its link is dropped; a reopened one is imported (#92)', async () => {
  const done = c('a', {completed: true});
  const f = fakes([R('r1', done)], [D('l1', done)]);
  let gets = 0;
  const get = f.provider.get;
  f.provider.get = async id => (gets++, get(id));
  const out = await syncTasks(f.provider, f.store, [link('r1', 'l1', done)]);
  expect(gets).toBe(0);
  expect(out.links).toEqual([]);
  expect(f.log).toEqual([]);
  // reopened on the service: listed as open, so it comes in as a new task
  f.provider.list = async () => [R('r1', c('a'))];
  const again = await syncTasks(f.provider, f.store, out.links);
  expect(f.log).toEqual(['create local a']);
  expect(again.links).toHaveLength(1);
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
    // a date-only task read from Todoist stays date-only when written back (#66)
    const back = toTodoistBody(c('x', {due: fromTodoist({id: '8', content: 'x', due: {date: '2026-11-20'}}).due}));
    expect(back).toMatchObject({due_date: '2026-11-20'});
    expect(back).not.toHaveProperty('due_datetime');
  });

  test('pages through the list, sends the token and closes a completed task', async () => {
    const calls: string[] = [];
    const provider = createTodoistProvider({
      token: 'test-token',
      fetch: async (url, init) => {
        calls.push(`${init.method} ${url}`);
        expect(init.headers.Authorization).toBe('Bearer test-token');
        const body = url.endsWith('/projects') ? {results: []} : url.endsWith('/tasks') && init.method === 'GET' ? {results: [task], next_cursor: 'c2'} : url.includes('cursor=') ? {results: [{...task, id: '9'}]} : task;
        return {ok: true, status: 200, json: async () => body, text: async () => ''};
      },
    });
    expect((await provider.list()).map(t => t.remoteId)).toEqual(['7', '9']);
    await provider.update('7', c('Buy milk', {completed: true}));
    expect(calls).toContain('POST https://api.todoist.com/api/v1/tasks/7/close');
  });

  test('names each task\'s project and marks the Inbox, so the tablet files it in that list (#212)', async () => {
    const projects = [
      {id: 'p1', name: 'Inbox', inbox_project: true},
      {id: 'p2', name: 'Habits'},
    ];
    const tasks = [
      {...task, id: '1', project_id: 'p1'},
      {...task, id: '2', project_id: 'p2'},
      {...task, id: '3', project_id: 'gone'},
    ];
    const provider = createTodoistProvider({
      token: 't',
      fetch: async url => {
        const body = url.endsWith('/projects') ? {results: projects} : {results: tasks};
        return {ok: true, status: 200, json: async () => body, text: async () => ''};
      },
    });
    const listed = await provider.list();
    expect(listed.map(t => t.list)).toEqual([{name: 'Inbox', inbox: true}, {name: 'Habits', inbox: false}, undefined]);
  });

  test('an id stays one path segment and a non-https base URL is refused (#81)', async () => {
    const calls: string[] = [];
    const provider = createTodoistProvider({
      token: 't',
      fetch: async (url, init) => (calls.push(`${init.method} ${url}`), {ok: true, status: 200, json: async () => task, text: async () => ''}),
    });
    await provider.remove('1/../projects/9');
    expect(calls).toEqual(['DELETE https://api.todoist.com/api/v1/tasks/1%2F..%2Fprojects%2F9']);
    expect(() => createTodoistProvider({token: 't', baseUrl: 'http://example.com', fetch: async () => ({ok: true, status: 200, json: async () => ({}), text: async () => ''})})).toThrow(/https/);
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
  GoogleSignedOutError,
  refreshAccessToken,
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

  test('the token refresh returns an access token; a revoked refresh token reads as signed out (#124)', async () => {
    const client = {clientId: 'id', clientSecret: 's'};
    const reply = (status: number, body: unknown) => (async () => ({ok: status < 400, status, json: async () => body})) as never;
    expect(await refreshAccessToken(reply(200, {access_token: 'a'}), client, 'r')).toBe('a');
    await expect(refreshAccessToken(reply(400, {error: 'invalid_grant'}), client, 'r')).rejects.toBeInstanceOf(GoogleSignedOutError);
    await expect(refreshAccessToken(reply(401, {error: 'invalid_client'}), client, 'r')).rejects.toThrow(/HTTP 401/);
  });
});

import {MAX_ANSWER_CHARS, calendarData, createCalDavProvider, createIcsProvider, expandEvents, httpsUrl, occurrenceStarts, parseIcs} from '../src';

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

  test('the lines of a VALARM never overwrite the event (#68)', () => {
    const {events} = parseIcs(ics(vevent([
      'UID:al', 'SUMMARY:Review', 'DESCRIPTION:Bring the report', 'DTSTART:20261120T120000Z', 'DTEND:20261120T130000Z',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:Alarm', 'DESCRIPTION:Reminder', 'DTSTART:20250101T000000Z', 'END:VALARM',
      'LOCATION:Room 1',
    ])));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({title: 'Review', content: 'Bring the report', start: Date.UTC(2026, 10, 20, 12)});
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

  test('a BYDAY on a daily rule is reported, not ignored (#61)', () => {
    const warnings: string[] = [];
    const {events} = parseIcs(ics(vevent(['UID:dd', 'DTSTART:20261102T100000Z', 'RRULE:FREQ=DAILY;BYDAY=MO,TU;COUNT=4'])));
    expect(expandEvents('c', events, WIDE, warnings)).toHaveLength(1);
    expect(warnings[0]).toMatch(/unsupported DAILY RRULE part BYDAY/);
  });

  test('a weekly BYMONTH and a supported weekly BYDAY are told apart (#61)', () => {
    const warnings: string[] = [];
    const bad = parseIcs(ics(vevent(['UID:wm', 'DTSTART:20261102T100000Z', 'RRULE:FREQ=WEEKLY;BYMONTH=11;COUNT=3']))).events;
    expect(expandEvents('c', bad, WIDE, warnings)).toHaveLength(1);
    expect(warnings[0]).toMatch(/BYMONTH/);
    const ok: string[] = [];
    const good = parseIcs(ics(vevent(['UID:wd', 'DTSTART:20261102T100000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU;COUNT=4']))).events;
    expect(expandEvents('c', good, WIDE, ok)).toHaveLength(4);
    expect(ok).toEqual([]);
  });

  test('a TZID other than UTC warns that the time is read as UTC (#61)', () => {
    const {events, warnings} = parseIcs(ics(vevent(['UID:tz', 'DTSTART;TZID=America/Sao_Paulo:20261102T100000'])));
    expect(events[0].start).toBe(Date.UTC(2026, 10, 2, 10));
    expect(warnings[0]).toMatch(/TZID America\/Sao_Paulo is read as UTC/);
    expect(parseIcs(ics(vevent(['UID:u', 'DTSTART;TZID=UTC:20261102T100000']))).warnings).toEqual([]);
  });

  test('both providers hand their warnings to onWarnings (#61)', async () => {
    const body = ics(vevent(['UID:p', 'DTSTART;TZID=Europe/Paris:20260301T180000', 'RRULE:FREQ=DAILY;BYDAY=MO']));
    const seen: string[][] = [];
    const feed = createIcsProvider(async () => body, [{id: 'f', name: 'F', url: 'https://x/f.ics'}], w => seen.push(w));
    await feed.listEvents('f', WIDE);
    const xml = `<d:multistatus xmlns:d="DAV:"><c:calendar-data xmlns:c="urn:ietf:params:xml:ns:caldav">${body}</c:calendar-data></d:multistatus>`;
    const dav = createCalDavProvider({
      fetch: (async () => ({ok: true, status: 207, text: async () => xml})) as never,
      calendars: [{id: 'h', name: 'H', url: 'https://x/h/'}],
      username: 'u',
      getPassword: async () => 'fixture-pw',
      basicAuth: (u, pw) => `${u}:${pw}`,
      onWarnings: w => seen.push(w),
    });
    await dav.listEvents('h', WIDE);
    expect(seen).toHaveLength(2);
    for (const w of seen) expect(w.join('\n')).toMatch(/TZID Europe\/Paris[\s\S]*unsupported DAILY/);
  });

  test('a bad UNTIL warns for that event and every other event still expands (#79)', () => {
    const warnings: string[] = [];
    const {events} = parseIcs(ics([
      vevent(['UID:bad', 'DTSTART:20260101T100000Z', 'DTEND:20260101T110000Z', 'RRULE:FREQ=DAILY;UNTIL=garbage']),
      vevent(['UID:good', 'DTSTART:20260102T100000Z', 'DTEND:20260102T110000Z']),
    ].join('\r\n')));
    const out = expandEvents('c', events, WIDE, warnings);
    expect(out.map(e => e.eventId)).toEqual(['bad@1767261600000', 'good']);
    expect(warnings).toEqual(['bad: bad RRULE UNTIL garbage']);
  });

  test('CalDAV and ICS refuse a URL that is not https and never name its path (#80)', async () => {
    const fetched: string[] = [];
    const dav = createCalDavProvider({
      fetch: (async (u: string) => (fetched.push(u), {ok: true, status: 207, text: async () => ''})) as never,
      calendars: [{id: 'h', name: 'H', url: 'http://caldav.example.com/secret-path/'}],
      username: 'u',
      getPassword: async () => 'fixture-pw',
      basicAuth: (u, pw) => `${u}:${pw}`,
    });
    await expect(dav.listEvents('h', WIDE)).rejects.toThrow('CalDAV calendar needs an https: URL, got http://caldav.example.com');
    const feed = createIcsProvider(async u => (fetched.push(u), ''), [{id: 'f', name: 'F', url: 'http://example.com/f.ics?key=abc'}]);
    await expect(feed.listEvents('f', WIDE)).rejects.toThrow(/https/);
    expect(fetched).toEqual([]);
  });

  test('an ICS feed or CalDAV answer larger than the limit is refused (#82)', async () => {
    const big = 'x'.repeat(MAX_ANSWER_CHARS + 1);
    const feed = createIcsProvider(async () => big, [{id: 'f', name: 'F', url: 'https://example.com/f.ics'}]);
    await expect(feed.listEvents('f', WIDE)).rejects.toThrow(/larger than/);
    const dav = createCalDavProvider({
      fetch: (async () => ({ok: true, status: 207, text: async () => big})) as never,
      calendars: [{id: 'h', name: 'H', url: 'https://caldav.example.com/c/'}],
      username: 'u',
      getPassword: async () => 'fixture-pw',
      basicAuth: (u, pw) => `${u}:${pw}`,
    });
    await expect(dav.listEvents('h', WIDE)).rejects.toThrow(/larger than/);
  });

  test('calendar-data is read in one pass, and an unclosed element is a warning (#82)', () => {
    const warnings: string[] = [];
    expect(calendarData('<c:calendar-data x="1">A</c:calendar-data><calendar-data>B</calendar-data>', warnings)).toEqual(['A', 'B']);
    expect(warnings).toEqual([]);
    expect(calendarData('<calendar-data>A</calendar-data>' + '<calendar-data>'.repeat(5000), warnings)).toEqual(['A']);
    expect(warnings).toHaveLength(1);
    const started = Date.now();
    calendarData('<calendar-data'.repeat(10000), []);
    // On 10000 open tags the bounded scan took 113 ms and an unbounded `[^>]*` one 47 s on a loaded Mac; 50000
    // tags against 1 s failed under load (1237 ms, #19).
    // timing-independent: 5 s sits 40 times above the bounded scan and 9 times below the unbounded one.
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test('a daily rule from far in the past jumps to the window and returns the same occurrences (#82)', () => {
    const {events} = parseIcs(ics(vevent(['UID:old', 'DTSTART:00010101T100000Z', 'DTEND:00010101T110000Z', 'RRULE:FREQ=DAILY;INTERVAL=3'])));
    const from = Date.UTC(2026, 0, 1);
    const to = Date.UTC(2026, 0, 31);
    const all = occurrenceStarts(events[0], to).filter(t => t >= from);
    expect(all.length).toBeGreaterThan(5);
    expect(occurrenceStarts(events[0], to, [], from)).toEqual(expect.arrayContaining(all));
    expect(occurrenceStarts(events[0], to, [], from).length).toBeLessThanOrEqual(all.length + 1);
    const weekly = parseIcs(ics(vevent(['UID:w', 'DTSTART:00010102T100000Z', 'DTEND:00010102T110000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE'])));
    const wAll = occurrenceStarts(weekly.events[0], to).filter(t => t >= from);
    expect(occurrenceStarts(weekly.events[0], to, [], from).filter(t => t >= from)).toEqual(wAll);
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

describe('tablet-only tasks on the first pass (owner assumption, safe first sync)', () => {
  const many = (n: number) => Array.from({length: n}, (_, i) => D(`l${i}`, c(`tablet ${i}`), 500));

  test('a first pass with N unlinked tablet tasks creates none on the service', async () => {
    const f = fakes([R('r1', c('from todoist'))], many(94));
    const out = await syncTasks(f.provider, f.store, []);
    expect(f.log).toEqual(['create local from todoist']);
    expect(out.keptLocal).toBe(94);
  });

  test('the run carries the kept count as data for Settings, never as a warning (#411)', async () => {
    const f = fakes([], many(3));
    const {run} = await runTodoModule({provider: f.provider, store: f.store}, [], () => 9);
    expect(run.keptLocal).toBe(3);
    expect(run.warnings).toEqual([]);
  });

  test('with «Send tablet-only items» on, the first pass creates all N', async () => {
    const f = fakes([], many(5));
    const out = await syncTasks(f.provider, f.store, [], {sendTabletOnly: true});
    expect(out.counts.createdRemote).toBe(5);
    expect(out.keptLocal).toBe(0);
  });

  test('a task made after the first link is sent; an older one stays on the tablet', async () => {
    const f = fakes([], [D('old', c('old'), 500), D('new', c('new'), 1500)]);
    const policy = {firstLinked: 1000, sendTabletOnly: false};
    const out = await syncTasks(f.provider, f.store, [], policy);
    expect(f.log).toEqual(['create remote new']);
    expect(out.keptLocal).toBe(1);
  });
});
