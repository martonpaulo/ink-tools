/** The Calendar and To-Do stores over an in-memory content provider (#28, #29, #44). */
import type {Row} from '@supernote-tools/sn-adapter';
import {
  ContentRows,
  createDeviceCalendar,
  createDeviceTasks,
} from '../src/deviceStores';

const EVENTS = 'content://com.ratta.supernote.calendar.provider/data_info';
const TASKS = 'content://com.ratta.supernote.task.provider/tasks_table';
const GROUPS = 'content://com.ratta.supernote.task.provider/task_group_table';
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

/** A provider with one table per URI and equality filters, as the native module answers. */
function provider(start: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    [EVENTS]: [],
    [TASKS]: [],
    [GROUPS]: [],
    ...start,
  };
  let next = 100;
  const match = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  const rows: ContentRows = {
    query: async (uri, where) =>
      tables[uri].filter(r => match(r, where)).map(r => ({...r})),
    insert: async (uri, row) => {
      const id = String(next++);
      tables[uri].push({...row, id});
      return id;
    },
    update: async (uri, where, row) => {
      const hit = tables[uri].filter(r => match(r, where));
      hit.forEach(r => Object.assign(r, row));
      return hit.length;
    },
    remove: async (uri, where) => {
      const before = tables[uri].length;
      tables[uri] = tables[uri].filter(r => !match(r, where));
      return before - tables[uri].length;
    },
  };
  return {tables, rows};
}

const event = {
  eventId: 'g1',
  calendarId: 'work',
  title: 'Standup',
  content: '',
  start: NOW,
  end: NOW + HOUR,
  allDay: false,
};
const window = {from: NOW - 24 * HOUR, to: NOW + 24 * HOUR};

describe('the Calendar store', () => {
  test('writes tag=task rows with calendarId and eventId, and lists only ours in the window', async () => {
    const {tables, rows} = provider({
      [EVENTS]: [
        {
          id: '1',
          tag: 'event',
          calendarId: 'x',
          eventId: 'n1',
          title: 'Native',
          startTime: NOW,
          endTime: NOW + HOUR,
        },
      ],
    });
    const cal = createDeviceCalendar(rows, () => NOW);
    await cal.create(event);
    await cal.create({
      ...event,
      eventId: 'g2',
      start: NOW + 72 * HOUR,
      end: NOW + 73 * HOUR,
    });
    expect(tables[EVENTS][1]).toMatchObject({
      tag: 'task',
      calendarId: 'work',
      eventId: 'g1',
      title: 'Standup',
      startTime: NOW,
    });
    expect((await cal.listOurs(window)).map(e => e.eventId)).toEqual(['g1']);
  });

  test('updates and removes by its keys; a write that changed no row throws', async () => {
    const {tables, rows} = provider();
    const cal = createDeviceCalendar(rows, () => NOW);
    await cal.create(event);
    await cal.update({...event, title: 'Planning'});
    expect(tables[EVENTS][0].title).toBe('Planning');
    await expect(cal.update({...event, eventId: 'gone'})).rejects.toThrow(
      'changed 0 rows',
    );
    await cal.remove('work', 'g1');
    expect(tables[EVENTS]).toEqual([]);
    await expect(cal.remove('work', 'g1')).rejects.toThrow('changed 0 rows');
  });

  test('a tablet-made row is an edit, and a relink gives it the service id', async () => {
    const {tables, rows} = provider({
      [EVENTS]: [
        {
          id: '7',
          tag: 'task',
          calendarId: 'work',
          eventId: '',
          title: 'Lunch',
          startTime: NOW,
          endTime: NOW + HOUR,
          status: 'normal',
        },
      ],
    });
    const cal = createDeviceCalendar(rows, () => NOW);
    expect(await cal.listOurs(window)).toEqual([]);
    const [edit] = await cal.listEdits(window);
    expect(edit).toMatchObject({
      cancelled: false,
      event: {eventId: '', title: 'Lunch'},
    });
    await cal.relink(edit.event, {calendarId: 'work', eventId: 'g9'});
    expect(tables[EVENTS][0]).toMatchObject({id: '7', eventId: 'g9'});
    await expect(
      cal.relink(edit.event, {calendarId: 'work', eventId: 'g9'}),
    ).rejects.toThrow('waiting for its id');
  });
});

describe('the To-Do store', () => {
  const list = {id: '1', taskListId: 'inbox', deleted: 0};

  test('creates a task in an existing list with hasSync=0, known by its row id', async () => {
    const {tables, rows} = provider({[GROUPS]: [list]});
    const tasks = createDeviceTasks(rows, () => NOW);
    const made = await tasks.create({
      title: 'Buy milk',
      detail: '',
      due: null,
      completed: false,
    });
    expect(made).toMatchObject({
      localId: '100',
      title: 'Buy milk',
      deleted: false,
    });
    expect(tables[TASKS][0]).toMatchObject({
      taskListId: 'inbox',
      hasSync: 0,
      status: 'needsAction',
    });
    expect((await tasks.list()).map(t => t.localId)).toEqual(['100']);
  });

  test('a tablet with no list refuses the create instead of writing a lost row', async () => {
    const tasks = createDeviceTasks(provider().rows, () => NOW);
    await expect(
      tasks.create({title: 'x', detail: '', due: null, completed: false}),
    ).rejects.toThrow('no To-Do list');
  });

  test('update and soft delete mark the row for the native sync', async () => {
    const {tables, rows} = provider({
      [GROUPS]: [list],
      [TASKS]: [
        {
          id: '5',
          taskId: 't5',
          taskListId: 'inbox',
          title: 'Old',
          status: 'needsAction',
          deleted: 0,
          hasSync: 1,
        },
      ],
    });
    const tasks = createDeviceTasks(rows, () => NOW);
    await tasks.update('t5', {
      title: 'New',
      detail: 'd',
      due: null,
      completed: true,
    });
    expect(tables[TASKS][0]).toMatchObject({
      title: 'New',
      status: 'completed',
      hasSync: 0,
      lastModified: NOW,
    });
    await tasks.remove('t5');
    expect(tables[TASKS][0]).toMatchObject({deleted: 1, hasSync: 0});
    await expect(
      tasks.update('nope', {
        title: '',
        detail: '',
        due: null,
        completed: false,
      }),
    ).rejects.toThrow('no task nope');
  });
});
