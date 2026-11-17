/** The tablet's sync runner: Sync now, the automatic pass and the module wiring (#28, #40, #44). */
import {
  BridgeSettings,
  defaultSettings,
  setModule,
  setProvider,
} from '@supernote-tools/sync-core/settings';
import type {CapabilityStatus} from '@supernote-tools/sn-adapter';
import type {Row} from '@supernote-tools/sn-adapter';
import {ContentRows, createDeviceStores} from '../src/deviceStores';
import {
  AUTO_SYNC_MINUTES,
  calendarWindow,
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
    probe: async () => ON,
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
    calendarId: 'work',
    eventId: expect.stringContaining('e1'),
    title: 'Standup',
  });
  expect(inserted.find(r => !r.tag)).toMatchObject({
    title: 'Buy milk',
    hasSync: 0,
    taskListId: 'inbox',
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

test('a missing Google client or sign-in is an error of the run, never an empty calendar', async () => {
  const noClient = await createSyncRunner(
    device({googleClient: undefined}),
  ).syncNow();
  expect(noClient.runs.calendar?.errors).toEqual([
    'google: the Google sign-in client is not on the tablet',
  ]);
  const signedOut = await createSyncRunner(
    device({secrets: {read: async () => null, remove: async () => {}}}),
  ).syncNow();
  expect(signedOut.runs.calendar?.errors[0]).toMatch(
    /inkctl secret set google/,
  );
  expect(signedOut.runs.todo?.errors).toEqual([
    'Todoist is not turned on or not signed in',
  ]);
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
  expect(timers.setInterval).toHaveBeenCalledWith(
    expect.any(Function),
    AUTO_SYNC_MINUTES * 60_000,
  );
  tick();
  expect(syncNow).toHaveBeenCalledTimes(2);
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
    {localId: 'l1', title: 'a', detail: '', due: null, completed: false, deleted: false, modified: 1},
    {localId: 'l2', title: 'b', detail: '', due: null, completed: false, deleted: false, modified: 1},
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
