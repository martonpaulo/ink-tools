import {
  BUNDLED_DESCRIPTOR as D,
  DeviceReader,
  chooseDescriptor,
  contentUri,
  parseDescriptor,
  probeAll,
  probeCapability,
  NO_TEST_WRITE,
  NO_ROW_ID,
  toCalendarInsert,
  todoShapeGaps,
  toTodoInsert,
} from '../src';

const full: Record<string, string[]> = {};
for (const m of [D.calendar, D.todo, D.digest]) {
  for (const name of Object.keys(m.tables)) full[contentUri(m, name)] = m.tables[name].columns;
}
const reader = (cols: Record<string, string[]>, refuseWrites: string[] = []): DeviceReader => ({
  columnsOf: async uri => {
    if (!(uri in cols)) throw new Error('no provider');
    return cols[uri];
  },
  testWrite: async uri => {
    if (refuseWrites.includes(uri)) throw new Error('Permission Denial');
    return 0;
  },
});

test('the bundled descriptor parses and builds URIs', () => {
  expect(parseDescriptor(JSON.parse(JSON.stringify(D)))).toEqual(D);
  expect(contentUri(D.calendar, 'events')).toBe('content://com.ratta.supernote.calendar.provider/data_info');
});

test('parseDescriptor rejects a wrong schema and a missing authority', () => {
  expect(() => parseDescriptor({...D, schema: 2})).toThrow(/schema/);
  expect(() => parseDescriptor({...D, todo: {...D.todo, authority: ''}})).toThrow(/authority/);
});

test('parseDescriptor refuses an update that lacks a rule the adapter reads (#84)', () => {
  const copy = () => JSON.parse(JSON.stringify(D));
  const noTag = copy();
  delete noTag.calendar.rules.writeTag;
  expect(() => parseDescriptor(noTag)).toThrow(/calendar: rule writeTag must be a string/);
  const noStatus = copy();
  delete noStatus.todo.rules.statusCompleted;
  expect(() => parseDescriptor(noStatus)).toThrow(/todo: rule statusCompleted/);
  const badList = copy();
  badList.todo.rules.requiredOnInsert = 'title';
  expect(() => parseDescriptor(badList)).toThrow(/requiredOnInsert must be a string\[\]/);
});

test('probe: matching device is available', async () => {
  const all = await probeAll(D, reader(full));
  expect(all.every(s => s.available)).toBe(true);
  expect(all.filter(s => s.canWrite).map(s => s.capability).sort()).toEqual(['calendar', 'todo']);
});

test('probe: the Digest is never test-written, as a plugin cannot delete the row again (#42)', async () => {
  const tried: string[] = [];
  const digest = await probeCapability(D, 'digest', {
    columnsOf: async uri => full[uri],
    testWrite: async uri => {
      tried.push(uri);
      return 0;
    },
  });
  expect(tried).toEqual([]);
  expect(digest).toEqual({
    capability: 'digest',
    available: true,
    canWrite: false,
    problems: [NO_TEST_WRITE],
    kinds: ['noTestWrite'],
  });
});

test('the Digest reads the knowledge table, not the old digest path the provider refuses (#42)', () => {
  expect(contentUri(D.digest, 'knowledge')).toBe('content://com.ratta.supernote.knowledge.provider/knowledge');
  const noRule = JSON.parse(JSON.stringify(D));
  delete noRule.digest.rules.insertPath;
  expect(() => parseDescriptor(noRule)).toThrow(/digest: rule insertPath must be a string/);
});

test('probe: each test write is a no-op update selected by row id -1, never an insert (#43)', async () => {
  const writes: unknown[] = [];
  const recording: DeviceReader = {
    columnsOf: async uri => full[uri],
    testWrite: async (uri, where, values) => {
      writes.push({uri, where, values});
      return 0;
    },
  };
  // The reader has no insert: the probe can only read and update.
  expect(Object.keys(recording).sort()).toEqual(['columnsOf', 'testWrite']);
  await probeAll(D, recording);
  expect(NO_ROW_ID).toBe(-1);
  expect(writes).toEqual([
    {uri: contentUri(D.calendar, 'events'), where: {id: -1}, values: {status: 'cancelled'}},
    {uri: contentUri(D.todo, 'tasks'), where: {id: -1}, values: {hasSync: 0}},
  ]);
});

test('probe: a test write that changed a row is not proof of a safe write (#43)', async () => {
  const calendar = await probeCapability(D, 'calendar', {
    columnsOf: async uri => full[uri],
    testWrite: async () => 3,
  });
  expect(calendar).toMatchObject({available: true, canWrite: false});
  expect(calendar.problems[0]).toMatch(/changed 3 rows on a test write that selects none/);
});

test('probe: only the capabilities asked for are read or written (#43)', async () => {
  const touched: string[] = [];
  const all = await probeAll(D, {
    columnsOf: async uri => {
      touched.push(uri);
      return full[uri];
    },
    testWrite: async uri => {
      touched.push(uri);
      return 0;
    },
  }, ['todo']);
  expect(all.map(s => s.capability)).toEqual(['todo']);
  expect(touched.every(uri => uri.startsWith(`content://${D.todo.authority}/`))).toBe(true);
});

/**
 * Every column one real `data_info` row fills on the tablet (#43): the NOT NULL candidates. `tag` and
 * `lastModifiedTime` are measured refusals; a null was seen in every other column.
 */
const CALENDAR_NOT_NULL = ['calendarId', 'tag', 'state', 'readOnly', 'isAllDay', 'title', 'startTime', 'endTime', 'lastModifiedTime', 'status'];
const CALENDAR_NULLABLE = ['eventId', 'isSelf', 'content', 'startDate', 'endDate', 'recurrence', 'recurringEventId', 'originalStartTime', 'originalStartDate'];

test('the descriptor names every NOT NULL Calendar column, and only columns a real row fills (#43)', () => {
  expect([...D.calendar.rules.requiredOnInsert].sort()).toEqual([...CALENDAR_NOT_NULL].sort());
  for (const col of CALENDAR_NULLABLE) expect(D.calendar.tables.events.columns).toContain(col);
  expect([...CALENDAR_NOT_NULL, ...CALENDAR_NULLABLE, 'id'].sort()).toEqual([...D.calendar.tables.events.columns].sort());
});

test('probe: a provider that reads but refuses writes cannot write (#67)', async () => {
  const todoUri = contentUri(D.todo, 'tasks');
  const todo = await probeCapability(D, 'todo', reader(full, [todoUri]));
  expect(todo).toMatchObject({available: true, canWrite: false});
  expect(todo.problems[0]).toMatch(/refused a test write: Permission Denial/);
});

test('probe: missing column or silent provider turns the capability off', async () => {
  const todoUri = contentUri(D.todo, 'tasks');
  const cols = {...full, [todoUri]: full[todoUri].filter(c => c !== 'hasSync')};
  const todo = await probeCapability(D, 'todo', reader(cols));
  expect(todo).toMatchObject({available: false, canWrite: false});
  expect(todo.problems[0]).toMatch(/hasSync/);
  const {[contentUri(D.digest, 'knowledge')]: _gone, ...noDigest} = full;
  const digest = await probeCapability(D, 'digest', reader(noDigest));
  expect(digest.available).toBe(false);
  expect(digest.problems[0]).toMatch(/did not answer/);
});

test('calendar insert forces tag=task and state, keeps a given status, drops unknown columns', () => {
  const full = {calendarId: 'c1', readOnly: 1, isAllDay: 0, title: 'Dentist', startTime: 1, endTime: 2, lastModifiedTime: 3};
  expect(toCalendarInsert(D, {...full, tag: 'x', state: 7, bogus: 1})).toEqual({...full, tag: 'task', state: 0, status: 'confirmed'});
  expect(toCalendarInsert(D, {...full, status: 'cancelled'}).status).toBe('cancelled');
  // An untitled event still writes: SQLite's NOT NULL accepts an empty text.
  expect(toCalendarInsert(D, {...full, title: ''}).title).toBe('');
});

test('calendar insert throws on each NOT NULL column it would leave empty, before the provider refuses it (#43)', () => {
  const full = {calendarId: 'c1', readOnly: 1, isAllDay: 0, title: 'Dentist', startTime: 1, endTime: 2, lastModifiedTime: 3};
  for (const col of Object.keys(full)) {
    const gap = {...full} as Record<string, unknown>;
    delete gap[col];
    expect(() => toCalendarInsert(D, gap as never)).toThrow(`calendar insert needs ${col}`);
    expect(() => toCalendarInsert(D, {...full, [col]: null})).toThrow(col);
  }
});

test('to-do insert enforces title, taskId, existing list and hasSync=0', () => {
  const ctx = {existingListIds: ['L1'], now: 7};
  expect(toTodoInsert(D, {title: 'Buy milk', taskId: 't1', taskListId: 'L1', createTime: 5}, ctx)).toEqual({
    title: 'Buy milk',
    taskId: 't1',
    taskListId: 'L1',
    hasSync: 0,
    deleted: 0,
    isReminderOn: 0,
    dueTime: 0,
    completedTime: 0,
    sort: 0,
    sortCompleted: 0,
    plannedSort: 0,
    lastModified: 7,
    sortTime: 7,
    plannedSortTime: 7,
  });
  expect(() => toTodoInsert(D, {taskId: 't1', taskListId: 'L1'}, ctx)).toThrow(/title/);
  expect(() => toTodoInsert(D, {title: 'x', taskListId: 'L1'}, ctx)).toThrow(/taskId/);
  expect(() => toTodoInsert(D, {title: 'x', taskId: 't1', taskListId: 'nope'}, ctx)).toThrow(/existing list/);
  // No list is an unfiled task, the app's own Inbox (#212); NULL, never an empty text.
  expect(toTodoInsert(D, {title: 'x', taskId: 't1', taskListId: ''}, ctx).taskListId).toBeNull();
  expect(toTodoInsert(D, {title: 'x', taskId: 't1'}, ctx).taskListId).toBeNull();
  // A descriptor that forbids unfiled tasks fails like an unknown list (#63).
  const strict = {...D, todo: {...D.todo, rules: {...D.todo.rules, allowNoList: false}}};
  expect(() => toTodoInsert(strict, {title: 'x', taskId: 't1'}, ctx)).toThrow(/taskListId/);
});

test('every tasks_table column but the row key is written on insert, as a native row has it (#212)', () => {
  const row = toTodoInsert(D, {...todoTaskToRow(D, {title: 'a', detail: '', due: null, completed: false}, 3), taskId: 't', taskListId: 'L'}, {existingListIds: ['L'], now: 3});
  const unset = ['id', 'recurrence', 'importance', 'links'];
  expect(Object.keys(row).sort()).toEqual(D.todo.tables.tasks.columns.filter(c => !unset.includes(c)).sort());
  expect(Object.values(row)).not.toContain(null);
});

test('shape gaps fill only the columns a row lacks', () => {
  expect(todoShapeGaps(D, {deleted: null, sort: 4, sortTime: null}, 9)).toEqual({
    deleted: 0, isReminderOn: 0, dueTime: 0, completedTime: 0, sortCompleted: 0, plannedSort: 0,
    lastModified: 9, sortTime: 9, plannedSortTime: 9,
  });
  const native = toTodoInsert(D, {title: 'a', taskId: 't'}, {existingListIds: [], now: 1});
  expect(todoShapeGaps(D, native, 9)).toEqual({});
});

import {rowToTodoTask, todoTaskToRow} from '../src';

test('a To-Do row round-trips through the task shape and keeps the insert rules', () => {
  const row = todoTaskToRow(D, {title: 'Pay rent', detail: 'by card', due: 1700000000000, completed: false}, 5);
  const task = rowToTodoTask(D, {...row, taskId: 'abc', deleted: 0});
  expect(task).toMatchObject({localId: 'abc', title: 'Pay rent', detail: 'by card', due: 1700000000000, completed: false, modified: 5, deleted: false});
  const done = rowToTodoTask(D, {...todoTaskToRow(D, {...task, completed: true}, 9), taskId: 'abc', deleted: '1'});
  expect(done).toMatchObject({completed: true, deleted: true});
  expect(toTodoInsert(D, {...row, taskId: 'abc', taskListId: 'L'}, {existingListIds: ['L'], now: 5}).hasSync).toBe(0);
});

import {calendarLink, eventToRow, legacyRowRepair, readCalendarLink, rowToDeviceEdit, rowToEvent} from '../src';

test('an event row carries the tag and round-trips', () => {
  const e = {eventId: 'e1', calendarId: 'c1', title: 'Dentist', content: '', start: 1000, end: 2000, allDay: false};
  const row = eventToRow(D, e, 5);
  expect(row.tag).toBe('task');
  // The real writer fills every NOT NULL column too (#43).
  for (const col of CALENDAR_NOT_NULL) expect(row[col] ?? null).not.toBeNull();
  // The row's lastModifiedTime is its change time, which decides an edit on both sides (#87).
  expect(rowToEvent(D, row)).toEqual({...e, modified: 5});
  const {lastModifiedTime: _unused, ...noTime} = row;
  expect(rowToEvent(D, noTime)).toEqual(e);
});

test('a row with a missing or unusable id or time throws instead of becoming "undefined" or NaN (#70)', () => {
  const row = eventToRow(D, {eventId: 'e1', calendarId: 'c1', title: 't', content: '', start: 1000, end: 2000, allDay: false}, 5);
  for (const key of ['calendarId', 'startTime', 'endTime']) {
    const missing = {...row};
    delete missing[key];
    expect(() => rowToEvent(D, missing)).toThrow(key);
    expect(() => rowToEvent(D, {...row, [key]: null})).toThrow(key);
  }
  expect(() => rowToEvent(D, {...row, startTime: 'soon'})).toThrow('startTime');
  expect(() => rowToTodoTask(D, {title: 'x'})).toThrow('taskId');
});

test('a row reads as an edit: hidden is the delete signal, no eventId is a tablet-made event (#29)', () => {
  const e = {eventId: 'e1', calendarId: 'c1', title: 'Dentist', content: '', start: 1000, end: 2000, allDay: false};
  const row = eventToRow(D, e, 5);
  expect(rowToDeviceEdit(D, row)).toEqual({event: {...e, modified: 5}, cancelled: false});
  expect(rowToDeviceEdit(D, {...row, status: 'cancelled'}).cancelled).toBe(true);
  expect(rowToDeviceEdit(D, {...row, calendarId: 'Home'}).event).toMatchObject({eventId: '', calendarId: 'Home'});
  expect(() => rowToDeviceEdit(D, {...row, calendarId: 'Home', startTime: null})).toThrow('startTime');
  const noRule = JSON.parse(JSON.stringify(D));
  delete noRule.calendar.rules.cancelledStatus;
  expect(() => parseDescriptor(noRule)).toThrow(/cancelledStatus/);
});

describe('chooseDescriptor (#43)', () => {
  const withVersion = (descriptorVersion: unknown) => JSON.stringify({...D, descriptorVersion});

  it('keeps the bundled descriptor when there is no update', () => {
    expect(chooseDescriptor(undefined)).toEqual({descriptor: D, source: 'bundled', reason: 'no update'});
    expect(chooseDescriptor('  ').source).toBe('bundled');
  });

  it('takes a valid, newer update', () => {
    const choice = chooseDescriptor(withVersion('2099.01.01'));
    expect(choice.source).toBe('update');
    expect(choice.descriptor.descriptorVersion).toBe('2099.01.01');
    expect(choice.reason).toBeUndefined();
  });

  it('keeps the bundled one, with the reason, for a bad or older update', () => {
    expect(chooseDescriptor('{not json').reason).toBe('the update is not JSON');
    expect(chooseDescriptor(JSON.stringify({...D, schema: 2})).reason).toMatch(/^the update was rejected: descriptor schema 2/);
    expect(chooseDescriptor(withVersion('v2')).reason).toMatch(/is not YYYY.MM.DD/);
    expect(chooseDescriptor(withVersion(D.descriptorVersion)).reason).toMatch(/is not newer than/);
    expect(chooseDescriptor(withVersion('2000.01.01')).descriptor).toBe(D);
  });
});

describe('column map (#101)', () => {
  /** The bundled descriptor with the To-Do `dueTime` column renamed, as a firmware update could do. */
  const renamed = (): typeof D => {
    const d = JSON.parse(JSON.stringify(D));
    const tasks = d.todo.tables.tasks;
    tasks.columns = tasks.columns.map((c: string) => (c === 'dueTime' ? 'due_time' : c));
    tasks.fields.due = 'due_time';
    return parseDescriptor(d);
  };

  test('a renamed column is a descriptor change: the same task reads and writes', () => {
    const d = renamed();
    const row = todoTaskToRow(d, {title: 'Pay rent', detail: '', due: 1700000000000, completed: false}, 5);
    expect(row.due_time).toBe(1700000000000);
    expect(row).not.toHaveProperty('dueTime');
    expect(rowToTodoTask(d, {...row, taskId: 'abc'}).due).toBe(1700000000000);
  });

  test('a field that names a column the table does not list refuses the descriptor', () => {
    const d = JSON.parse(JSON.stringify(D));
    d.todo.tables.tasks.fields.due = 'due_time';
    expect(() => parseDescriptor(d)).toThrow('todo.tasks: field due names due_time, not a listed column');
  });

  test('a descriptor without a field the adapter reads is refused', () => {
    const d = JSON.parse(JSON.stringify(D));
    delete d.calendar.tables.events.fields.start;
    expect(() => parseDescriptor(d)).toThrow('calendar.events: missing field start');
    delete d.calendar.tables.events;
    expect(() => parseDescriptor(d)).toThrow('calendar: missing table events');
  });

  test('the bundled descriptor passes its own parser', () => {
    expect(parseDescriptor(JSON.parse(JSON.stringify(D)))).toEqual(D);
  });
});

describe('the visible Calendar row (#28)', () => {
  const e = {eventId: 'abc_20261117T090000Z', calendarId: 'team#holiday.calendar', title: 'Standup', content: 'Notes', start: 1_795_000_000_000, end: 1_795_000_900_000, allDay: false};

  test('a pulled event writes every column of the rows the Calendar app showed, with eventId NULL', () => {
    expect(eventToRow(D, e, 1_795_000_000_123)).toEqual({
      calendarId: calendarLink(D, e),
      eventId: null,
      tag: 'task',
      state: 0,
      status: 'confirmed',
      readOnly: 1,
      isAllDay: 0,
      title: 'Standup',
      content: 'Notes',
      startTime: 1_795_000_000_000,
      endTime: 1_795_000_900_000,
      startDate: null,
      endDate: null,
      lastModifiedTime: 1_795_000_000_123,
    });
  });

  // Google's all-day event of 17 November 2026: start.date 2026-11-17, exclusive end.date 2026-11-18.
  const allDay = {...e, allDay: true, start: Date.UTC(2026, 10, 17), end: Date.UTC(2026, 10, 18)};

  test('a pulled all-day event writes startDate and endDate as yyyy-MM-dd, which the Calendar app splits', () => {
    expect(eventToRow(D, allDay, 5)).toMatchObject({isAllDay: 1, startDate: '2026-11-17', endDate: '2026-11-18'});
  });

  test('an older all-day row with null dates is repaired with its dates; a dated one is left', () => {
    const linked = {...eventToRow(D, allDay, 5), id: 9, startDate: null, endDate: null};
    expect(legacyRowRepair(D, linked)).toEqual({startDate: '2026-11-17', endDate: '2026-11-18'});
    expect(legacyRowRepair(D, {...linked, isAllDay: '1'})).toEqual({startDate: '2026-11-17', endDate: '2026-11-18'});
    expect(legacyRowRepair(D, {...linked, startDate: '2026-11-17', endDate: '2026-11-18'})).toBeNull();
    const beta23 = {...linked, calendarId: e.calendarId, eventId: e.eventId};
    expect(legacyRowRepair(D, beta23)).toEqual({calendarId: calendarLink(D, e), eventId: null, startDate: '2026-11-17', endDate: '2026-11-18'});
    // A tablet-made row has no link: it is not ours to repair.
    expect(legacyRowRepair(D, {...linked, calendarId: 'Home'})).toBeNull();
  });

  test('the link in calendarId keeps both ids, whatever characters they hold', () => {
    const link = calendarLink(D, e);
    expect(link.startsWith('inktools:')).toBe(true);
    expect(readCalendarLink(D, link)).toEqual({calendarId: e.calendarId, eventId: e.eventId});
    expect(readCalendarLink(D, calendarLink(D, {calendarId: 'a:b', eventId: 'c:d'}))).toEqual({calendarId: 'a:b', eventId: 'c:d'});
    for (const other of ['Home', 'inktools:', 'inktools:only', 'inktools:a:b:c', '', null, 7]) expect(readCalendarLink(D, other)).toBeNull();
  });

  test('an older row with the Google id in eventId is repaired in place; any other row is left', () => {
    const old = {id: 7, tag: 'task', calendarId: e.calendarId, eventId: e.eventId, status: 'confirmed'};
    const fix = legacyRowRepair(D, old);
    expect(fix).toEqual({calendarId: calendarLink(D, e), eventId: null});
    expect(rowToEvent(D, {...eventToRow(D, e, 5), ...fix})).toMatchObject({calendarId: e.calendarId, eventId: e.eventId});
    expect(legacyRowRepair(D, {...old, ...fix})).toBeNull();
    expect(legacyRowRepair(D, {...old, eventId: null})).toBeNull();
    expect(legacyRowRepair(D, {...old, tag: 'event'})).toBeNull();
  });

  test('a descriptor without linkPrefix is refused', () => {
    const noRule = JSON.parse(JSON.stringify(D));
    delete noRule.calendar.rules.linkPrefix;
    expect(() => parseDescriptor(noRule)).toThrow(/linkPrefix/);
  });
});
