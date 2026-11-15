import {
  BUNDLED_DESCRIPTOR as D,
  DeviceReader,
  chooseDescriptor,
  contentUri,
  parseDescriptor,
  probeAll,
  probeCapability,
  toCalendarInsert,
  toTodoInsert,
} from '../src';

const full: Record<string, string[]> = {};
for (const m of [D.calendar, D.todo, D.digest]) {
  for (const name of Object.keys(m.tables)) full[contentUri(m, name)] = m.tables[name].columns;
}
const reader = (cols: Record<string, string[]>): DeviceReader => ({
  columnsOf: async uri => {
    if (!(uri in cols)) throw new Error('no provider');
    return cols[uri];
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
});

test('probe: missing column or silent provider turns the capability off', async () => {
  const todoUri = contentUri(D.todo, 'tasks');
  const cols = {...full, [todoUri]: full[todoUri].filter(c => c !== 'hasSync')};
  const todo = await probeCapability(D, 'todo', reader(cols));
  expect(todo.available).toBe(false);
  expect(todo.problems[0]).toMatch(/hasSync/);
  const {[contentUri(D.digest, 'digest')]: _gone, ...noDigest} = full;
  const digest = await probeCapability(D, 'digest', reader(noDigest));
  expect(digest.available).toBe(false);
  expect(digest.problems[0]).toMatch(/did not answer/);
});

test('calendar insert forces tag=task and drops unknown columns', () => {
  const row = toCalendarInsert(D, {title: 'Dentist', tag: 'x', bogus: 1});
  expect(row).toEqual({title: 'Dentist', tag: 'task'});
});

test('to-do insert enforces title, existing list and hasSync=0', () => {
  const ctx = {existingListIds: ['L1']};
  expect(toTodoInsert(D, {title: 'Buy milk', taskListId: 'L1', createTime: 5}, ctx)).toEqual({
    title: 'Buy milk',
    taskListId: 'L1',
    hasSync: 0,
  });
  expect(() => toTodoInsert(D, {taskListId: 'L1'}, ctx)).toThrow(/title/);
  expect(() => toTodoInsert(D, {title: 'x', taskListId: 'nope'}, ctx)).toThrow(/existing list/);
  // A missing list fails like an unknown one (#63).
  expect(() => toTodoInsert(D, {title: 'x'}, ctx)).toThrow(/taskListId/);
  expect(() => toTodoInsert(D, {title: 'x', taskListId: ''}, ctx)).toThrow(/taskListId/);
});

import {rowToTodoTask, todoTaskToRow} from '../src';

test('a To-Do row round-trips through the task shape and keeps the insert rules', () => {
  const row = todoTaskToRow(D, {title: 'Pay rent', detail: 'by card', due: 1700000000000, completed: false}, 5);
  const task = rowToTodoTask(D, {...row, taskId: 'abc', deleted: 0});
  expect(task).toMatchObject({localId: 'abc', title: 'Pay rent', detail: 'by card', due: 1700000000000, completed: false, modified: 5, deleted: false});
  const done = rowToTodoTask(D, {...todoTaskToRow(D, {...task, completed: true}, 9), taskId: 'abc', deleted: '1'});
  expect(done).toMatchObject({completed: true, deleted: true});
  expect(toTodoInsert(D, {...row, taskListId: 'L'}, {existingListIds: ['L']}).hasSync).toBe(0);
});

import {eventToRow, rowToEvent} from '../src';

test('an event row carries the tag and round-trips', () => {
  const e = {eventId: 'e1', calendarId: 'c1', title: 'Dentist', content: '', start: 1000, end: 2000, allDay: false};
  const row = eventToRow(D, e, 5);
  expect(row.tag).toBe('task');
  expect(rowToEvent(D, row)).toEqual(e);
});

test('a row with a missing or unusable id or time throws instead of becoming "undefined" or NaN (#70)', () => {
  const row = eventToRow(D, {eventId: 'e1', calendarId: 'c1', title: 't', content: '', start: 1000, end: 2000, allDay: false}, 5);
  for (const key of ['eventId', 'calendarId', 'startTime', 'endTime']) {
    const missing = {...row};
    delete missing[key];
    expect(() => rowToEvent(D, missing)).toThrow(key);
    expect(() => rowToEvent(D, {...row, [key]: null})).toThrow(key);
  }
  expect(() => rowToEvent(D, {...row, startTime: 'soon'})).toThrow('startTime');
  expect(() => rowToTodoTask(D, {title: 'x'})).toThrow('taskId');
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
