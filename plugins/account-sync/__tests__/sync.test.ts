/** The tablet's sync runner: Sync now, the automatic pass and the module wiring (#28, #40, #44). */
import {
  BridgeSettings,
  defaultSettings,
  setModule,
  setProvider,
} from '@ink-tools/sync-core/settings';
import type {CapabilityStatus} from '@ink-tools/sn-adapter';
import type {Row} from '@ink-tools/sn-adapter';
import {ContentRows, createDeviceStores} from '../src/deviceStores';
import {format} from '../src/copy';
import {
  AUTO_SYNC_MINUTES,
  calendarWindow,
  buildModules,
  createSyncRunner,
  startAutoSync,
  SyncDevice,
} from '../src/sync';

const NOW = new Date(2026, 10, 16, 21, 30).getTime();
const ON: CapabilityStatus[] = (['calendar', 'todo', 'digest'] as const).map(
  capability => ({
    capability,
    available: true,
    canWrite: true,
    problems: [],
    kinds: [],
  }),
);

function rows(): ContentRows & {inserted: Row[]} {
  const inserted: Row[] = [];
  return {
    inserted,
    query: async uri =>
      uri.endsWith('task_group_table')
        ? [{taskListId: 'inbox', title: 'Inbox', deleted: 0}]
        : [],
    insert: async (_uri, row) => {
      inserted.push(row);
      return String(inserted.length);
    },
    update: async () => 1,
    remove: async () => 1,
  };
}

function settings(...providers: ('google' | 'todoist')[]) {
  let s = setModule(
    setModule(defaultSettings(), 'calendar', true),
    'todo',
    true,
  );
  for (const p of providers) {
    s = setProvider(s, p, true);
  }
  return s;
}

/** A fake network for Google and Todoist; each request is recorded by its path. */
function network() {
  const calls: string[] = [];
  const answer = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  const fetch: SyncDevice['fetch'] = async url => {
    calls.push(url.replace(/\?.*$/, ''));
    if (url.includes('oauth2')) {
      return answer({access_token: 'access'});
    }
    if (url.includes('calendarList')) {
      return answer({items: [{id: 'work', summary: 'Work'}]});
    }
    if (url.includes('/events')) {
      return answer({
        items: [
          {
            id: 'e1',
            status: 'confirmed',
            summary: 'Standup',
            start: {dateTime: new Date(NOW).toISOString()},
            end: {dateTime: new Date(NOW + 3_600_000).toISOString()},
          },
        ],
      });
    }
    if (url.includes('/projects')) {
      return answer({
        results: [{id: 'p1', name: 'Inbox', inbox_project: true}],
        next_cursor: null,
      });
    }
    return answer({
      results: [
        {
          id: 'r1',
          project_id: 'p1',
          content: 'Buy milk',
          description: '',
          checked: false,
          due: null,
        },
      ],
      next_cursor: null,
    });
  };
  return {calls, fetch};
}

function device(
  over: Partial<SyncDevice> = {},
): SyncDevice & {lines: string[]} {
  const lines: string[] = [];
  return {
    lines,
    loadSettings: async () => ({
      ok: true,
      value: settings('google', 'todoist'),
    }),
    secrets: {
      read: async p =>
        p === 'google' ? 'refresh' : p === 'todoist' ? 'token' : null,
      remove: async () => {},
    },
    stores: createDeviceStores(rows(), () => NOW),
    probe: async capabilities =>
      ON.filter(status => capabilities.includes(status.capability)),
    googleClient: async () => ({clientId: 'id', clientSecret: 'secret'}),
    fetch: network().fetch,
    now: () => NOW,
    log: line => lines.push(line),
    ...over,
  };
}

test('Sync now runs Google into the Calendar and Todoist into the To-Do, with one token per pass', async () => {
  const net = network();
  const table = rows();
  const d = device({
    fetch: net.fetch,
    stores: createDeviceStores(table, () => NOW),
  });
  const snap = await createSyncRunner(d).syncNow();
  expect(snap.running).toBe(false);
  expect(snap.runs.calendar).toMatchObject({counts: {added: 1}, errors: []});
  expect(snap.runs.todo).toMatchObject({counts: {added: 1}, errors: []});
  const inserted = table.inserted;
  expect(inserted.find(r => r.tag)).toMatchObject({
    tag: 'task',
    // The link sits in calendarId and eventId stays NULL, the shape the Calendar app shows (#28).
    calendarId: expect.stringMatching(/^inktools:work:.*e1/),
    eventId: null,
    title: 'Standup',
  });
  expect(inserted.find(r => !r.tag)).toMatchObject({
    title: 'Buy milk',
    hasSync: 0,
    // Todoist's Inbox is the tablet's own Inbox: a task with no list (#212).
    taskListId: null,
    deleted: 0,
  });
  expect(net.calls.filter(c => c.includes('oauth2'))).toHaveLength(1);
  expect(d.lines.some(l => l.startsWith('[Bridge] sync calendar:'))).toBe(true);
});

test('a press during a pass joins it instead of starting a second', async () => {
  let release!: () => void;
  const d = device({
    loadSettings: () =>
      new Promise(
        r => (release = () => r({ok: true, value: defaultSettings()})),
      ),
  });
  const runner = createSyncRunner(d);
  const seen: boolean[] = [];
  runner.subscribe(s => seen.push(s.running));
  const a = runner.syncNow();
  const b = runner.syncNow();
  expect(a).toBe(b);
  release();
  await a;
  expect(seen).toEqual([true, false]);
});

test('without the device probe nothing runs, and the log says why', async () => {
  const d = device({probe: undefined});
  const snap = await createSyncRunner(d).syncNow();
  expect(snap.runs).toEqual({});
  expect(d.lines).toContain(
    '[Bridge] sync calendar: not run: the device check has not answered',
  );
});

test('the load pass never probes and writes nothing; the next pass probes (#43)', async () => {
  const probe = jest.fn(async (capabilities: string[]) =>
    ON.filter(status => capabilities.includes(status.capability)),
  );
  const table = rows();
  const imported = jest.fn(async () => []);
  const d = device({
    probe,
    importSecrets: imported,
    stores: createDeviceStores(table, () => NOW),
  });
  const runner = createSyncRunner(d);
  const load = await runner.syncNow({load: true});
  expect(probe).not.toHaveBeenCalled();
  expect(imported).toHaveBeenCalledTimes(1);
  expect(load.runs).toEqual({});
  expect(table.inserted).toEqual([]);
  expect(d.lines).toEqual([
    '[Bridge] sync: the load pass checks no device and writes nothing; the first check runs at «Sync now» or the automatic pass',
  ]);
  const next = await runner.syncNow();
  expect(probe).toHaveBeenCalledTimes(1);
  expect(Object.keys(next.runs).sort()).toEqual(['calendar', 'todo']);
});

test('a module that is off is never probed (#43)', async () => {
  const probe = jest.fn(async (capabilities: string[]) =>
    ON.filter(status => capabilities.includes(status.capability)),
  );
  const todoOnly = setProvider(
    setModule(defaultSettings(), 'todo', true),
    'todoist',
    true,
  );
  await createSyncRunner(
    device({probe, loadSettings: async () => ({ok: true, value: todoOnly})}),
  ).syncNow();
  expect(probe.mock.calls).toEqual([[['todo']]]);
  const allOff = jest.fn(async () => ON);
  await createSyncRunner(
    device({
      probe: allOff,
      loadSettings: async () => ({ok: true, value: defaultSettings()}),
    }),
  ).syncNow();
  expect(allOff).not.toHaveBeenCalled();
});

test('a cleared module is probed once per host; a blocked one again at the next pass (#43)', async () => {
  const probe = jest.fn(async (capabilities: string[]) =>
    ON.filter(status => capabilities.includes(status.capability)).map(status =>
      status.capability === 'todo'
        ? {...status, canWrite: false, problems: ['refused a test write'], kinds: ['refused' as const]}
        : status,
    ),
  );
  const runner = createSyncRunner(device({probe}));
  await runner.syncNow();
  const second = await runner.syncNow();
  expect(probe.mock.calls).toEqual([[['calendar', 'todo']], [['todo']]]);
  expect(second.probe).toEqual({calendar: [], todo: [format('probe.refused', {app: 'To-Do'})]});
});

test('a missing Google client or sign-in is an error of the run, never an empty calendar', async () => {
  const noClient = await createSyncRunner(
    device({googleClient: undefined}),
  ).syncNow();
  expect(noClient.runs.calendar?.errors).toEqual([
    'google: the Google sign-in client is not on the tablet: on the Mac, run inkctl secret set google-client',
  ]);
  expect(noClient.runs.calendar?.notRun).toBe(true);
  const broken = await createSyncRunner(
    device({
      googleClient: async () => {
        throw new Error('secrets: the Google client has no client_secret');
      },
    }),
  ).syncNow();
  expect(broken.runs.calendar?.errors).toEqual([
    'google: the Google sign-in client did not read: secrets: the Google client has no client_secret',
  ]);
  const signedOut = await createSyncRunner(
    device({secrets: {read: async () => null, remove: async () => {}}}),
  ).syncNow();
  expect(signedOut.runs.calendar?.errors[0]).toMatch(
    /inkctl secret set google/,
  );
  expect(signedOut.runs.todo?.errors).toEqual([
    'Todoist is not signed in: on the Mac, run inkctl secret set todoist',
  ]);
  expect(signedOut.runs.todo?.notRun).toBe(true);
});

test('an unreadable Todoist sign-in fails the to-do run with its reason', async () => {
  const d = device({
    secrets: {
      read: async p =>
        p === 'todoist' ? Promise.reject(new Error('EACCES')) : 'refresh',
      remove: async () => {},
    },
  });
  const snap = await createSyncRunner(d).syncNow();
  expect(snap.runs.todo?.errors).toEqual(['the sign-in did not read: EACCES']);
  expect(snap.runs.calendar?.errors).toEqual([]);
});

test('unreadable Settings start no pass and say why', async () => {
  const snap = await createSyncRunner(
    device({loadSettings: async () => ({ok: false, message: 'disk'})}),
  ).syncNow();
  expect(snap).toMatchObject({running: false, problem: 'disk', runs: {}});
});

test('the automatic sync runs at start and every AUTO_SYNC_MINUTES until stopped', () => {
  const syncNow = jest.fn(() => new Promise<never>(() => {}));
  let tick!: () => void;
  const timers = {
    setInterval: jest.fn((fn: () => void) => {
      tick = fn;
      return 7;
    }),
    clearInterval: jest.fn(),
  };
  const stop = startAutoSync(
    {
      syncNow,
      snapshot: jest.fn(),
      tabletOnlyTasks: jest.fn(),
      subscribe: jest.fn(),
    },
    timers,
  );
  expect(syncNow).toHaveBeenCalledTimes(1);
  expect(syncNow).toHaveBeenLastCalledWith({load: true});
  expect(timers.setInterval).toHaveBeenCalledWith(
    expect.any(Function),
    AUTO_SYNC_MINUTES * 60_000,
  );
  tick();
  expect(syncNow).toHaveBeenCalledTimes(2);
  expect(syncNow).toHaveBeenLastCalledWith();
  stop();
  expect(timers.clearInterval).toHaveBeenCalledWith(7);
});

test('the calendar window starts days before today at midnight', () => {
  const w = calendarWindow(NOW);
  expect(new Date(w.from).getHours()).toBe(0);
  expect(w.to - w.from).toBe(67 * 24 * 3_600_000);
});

test('each pass first moves in the sign-in drop files, before it reads a secret (#116)', async () => {
  const order: string[] = [];
  const d = device({
    importSecrets: async () => {
      order.push('import');
      return [
        {provider: 'todoist', moved: true},
        {
          provider: 'icloud',
          moved: false,
          problem: 'the drop file did not read: refused',
        },
      ];
    },
    loadSettings: async () => {
      order.push('settings');
      return {ok: true, value: settings('google', 'todoist')};
    },
  });
  await createSyncRunner(d).syncNow();
  expect(order.slice(0, 2)).toEqual(['import', 'settings']);
  expect(d.lines).toContain(
    '[Bridge] secrets: todoist moved in from the drop folder',
  );
  expect(d.lines).toContain(
    '[Bridge] secrets: icloud not moved in: the drop file did not read: refused',
  );
});

test('Settings reads the tablet-only tasks before the first pass, and the pass keeps the first-link time', async () => {
  const tasks = [
    {
      localId: 'l1',
      title: 'a',
      detail: '',
      due: null,
      completed: false,
      deleted: false,
      modified: 1,
    },
    {
      localId: 'l2',
      title: 'b',
      detail: '',
      due: null,
      completed: false,
      deleted: false,
      modified: 1,
    },
  ];
  const real = createDeviceStores(rows(), () => NOW);
  const saved: BridgeSettings[] = [];
  const d = device({
    stores: {...real, tasks: {...real.tasks, list: async () => tasks}},
    saveSettings: async s => {
      saved.push(s);
      return {ok: true};
    },
  });
  const runner = createSyncRunner(d);
  const before = (await d.loadSettings()) as {ok: true; value: BridgeSettings};
  expect(await runner.tabletOnlyTasks(before.value)).toBe(2);
  await runner.syncNow();
  expect(saved.at(-1)?.firstLinked).toEqual({calendar: NOW, todo: NOW});
});

describe('iCloud and ICS on the tablet (#30)', () => {
  const ROOT = 'https://caldav.icloud.com/';
  const HOME = 'https://p01-caldav.icloud.com/123/calendars/';
  const CAL = `${HOME}home/`;
  const FEED = 'webcal://feeds.example.com/private-token/holidays.ics';
  const vcal = (uid: string, title: string) =>
    [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${new Date(NOW).toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
      `DTEND:${new Date(NOW + 3_600_000).toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
      `SUMMARY:${title}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  const ms = (inner: string) =>
    `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${inner}</d:multistatus>`;
  const resp = (href: string, props: string) =>
    `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;

  function apple() {
    const calls: Array<{url: string; method: string; auth?: string}> = [];
    const text = (code: number, body: string) => ({
      ok: code < 300,
      status: code,
      json: async () => ({}),
      text: async () => body,
    });
    const fetch: SyncDevice['fetch'] = async (url, init) => {
      calls.push({url, method: init.method, auth: init.headers.Authorization});
      if (init.method === 'PROPFIND' && url === ROOT) {
        return text(207, ms(resp('/', '<d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal>')));
      }
      if (init.method === 'PROPFIND' && url.endsWith('/principal/')) {
        return text(207, ms(resp('/123/principal/', `<c:calendar-home-set><d:href>${HOME}</d:href></c:calendar-home-set>`)));
      }
      if (init.method === 'PROPFIND' && url === HOME) {
        return text(207, ms(resp('/123/calendars/home/', '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Home</d:displayname>')));
      }
      if (init.method === 'REPORT' && url === CAL) {
        return text(207, ms(resp('/123/calendars/home/a.ics', `<c:calendar-data>${vcal('a', 'Dentist').replace(/</g, '&lt;')}</c:calendar-data>`)));
      }
      if (init.method === 'GET' && url === 'https://feeds.example.com/private-token/holidays.ics') {
        return text(200, vcal('h', 'Holiday'));
      }
      return text(404, '');
    };
    return {calls, fetch};
  }

  const on = (feeds: string[] = [FEED]): BridgeSettings => ({
    ...setProvider(setProvider(setModule(defaultSettings(), 'calendar', true), 'icloud', true), 'ics', true),
    icsFeeds: feeds,
  });

  test('Sync now reads iCloud by discovery and the ICS feed over HTTPS into the native Calendar', async () => {
    const net = apple();
    const table = rows();
    const d = device({
      fetch: net.fetch,
      loadSettings: async () => ({ok: true, value: on()}),
      secrets: {
        read: async p => (p === 'icloud' ? 'tester@example.com:abcd-efgh-ijkl-mnop' : null),
        remove: async () => {},
      },
      stores: createDeviceStores(table, () => NOW),
    });
    const snap = await createSyncRunner(d).syncNow();
    expect(snap.runs.calendar).toMatchObject({counts: {added: 2}, errors: []});
    expect(table.inserted.map(r => r.title).sort()).toEqual(['Dentist', 'Holiday']);
    // The Basic credentials of tester@example.com:abcd-efgh-ijkl-mnop, never the plain pair.
    const auth = 'Basic dGVzdGVyQGV4YW1wbGUuY29tOmFiY2QtZWZnaC1pamtsLW1ub3A=';
    expect(net.calls.filter(c => c.url.includes('icloud')).every(c => c.auth === auth)).toBe(true);
    expect(net.calls.find(c => c.method === 'GET')?.auth).toBeUndefined();
  });

  test('iCloud gets the CalDAV writer and ICS none, so only iCloud takes tablet edits', async () => {
    const d = device({
      fetch: apple().fetch,
      secrets: {read: async () => 'tester@example.com:pw', remove: async () => {}},
    });
    const modules = await buildModules(d, ['icloud', 'ics'], [FEED]);
    const [icloud, ics] = modules.calendar!.sources;
    expect(icloud).toMatchObject({id: 'icloud', writer: expect.any(Object)});
    expect(ics.id).toBe('ics');
    expect(ics.writer).toBeUndefined();
    // The feed's name shows only its host: a private feed's path is a secret.
    expect(await ics.provider.listCalendars()).toEqual([
      {calendarId: 'https://feeds.example.com/private-token/holidays.ics', name: 'ICS 1 (feeds.example.com)'},
    ]);
  });

  test('signed out, a broken sign-in, a refused discovery and no feed each fail with the reason', async () => {
    const reasons = async (over: Partial<SyncDevice>, feeds: string[] = []) => {
      const modules = await buildModules(device(over), ['icloud', 'ics'], feeds);
      return Promise.all(
        modules.calendar!.sources.map(s =>
          s.provider.listCalendars().then(
            () => 'read',
            (e: Error) => e.message,
          ),
        ),
      );
    };
    expect(await reasons({secrets: {read: async () => null, remove: async () => {}}})).toEqual([
      'not signed in: on the Mac, run inkctl secret set icloud',
      'no ICS feed address in Settings',
    ]);
    expect((await reasons({secrets: {read: async () => 'no-colon', remove: async () => {}}}))[0]).toMatch(
      /^the sign-in did not read: .*<Apple ID>:<app-specific password>/,
    );
    const refused: SyncDevice['fetch'] = async () => ({ok: false, status: 401, json: async () => ({}), text: async () => ''});
    expect(
      (await reasons({fetch: refused, secrets: {read: async () => 'a@example.com:pw', remove: async () => {}}}))[0],
    ).toMatch(/^the iCloud calendars did not read: CalDAV refused the sign-in/);
  });
});

test('a pass with only one module probes and runs that module alone (#283)', async () => {
  const probe = jest.fn(async (capabilities: string[]) =>
    ON.filter(status => capabilities.includes(status.capability)),
  );
  const done = await createSyncRunner(device({probe})).syncNow({only: 'todo'});
  expect(probe.mock.calls).toEqual([[['todo']]]);
  expect(Object.keys(done.runs)).toEqual(['todo']);
});
