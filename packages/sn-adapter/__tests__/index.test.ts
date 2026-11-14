import {
  BUNDLED_DESCRIPTOR as D,
  DeviceReader,
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
