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
      // The Calendar provider's delete is `return 0;` on the tablet (#43).
      if (uri === EVENTS) {
        return 0;
      }
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

  test('updates by its keys; a write that changed no row throws', async () => {
    const {tables, rows} = provider();
    const cal = createDeviceCalendar(rows, () => NOW);
    await cal.create(event);
    await cal.update({...event, title: 'Planning'});
    expect(tables[EVENTS][0].title).toBe('Planning');
    await expect(cal.update({...event, eventId: 'gone'})).rejects.toThrow(
      'changed 0 rows',
    );
    await expect(cal.remove('work', 'gone')).rejects.toThrow('changed 0 rows');
  });

  test('removes an event by marking its row cancelled, never by a delete the provider ignores (#43)', async () => {
    const {tables, rows} = provider();
    const deletes: string[] = [];
    const watched: ContentRows = {
      ...rows,
      remove: async (uri, where) => {
        deletes.push(uri);
        return rows.remove(uri, where);
      },
    };
    let clock = NOW;
    const cal = createDeviceCalendar(watched, () => clock);
    await cal.create(event);
    clock = NOW + HOUR;
    await cal.remove('work', 'g1');
    expect(deletes).toEqual([]);
    expect(tables[EVENTS]).toHaveLength(1);
    expect(tables[EVENTS][0]).toMatchObject({
      eventId: 'g1',
      status: 'cancelled',
      lastModifiedTime: NOW + HOUR,
    });
    // A cancelled row is not one of the pulled events, so the next pass does not remove it again.
    expect(await cal.listOurs(window)).toEqual([]);
  });

  test('an event back at the source takes its cancelled row again, never a second row (#43)', async () => {
    const {tables, rows} = provider();
    const cal = createDeviceCalendar(rows, () => NOW);
    await cal.create(event);
    await cal.remove('work', 'g1');
    await cal.create({...event, title: 'Standup again'});
    expect(tables[EVENTS]).toHaveLength(1);
    expect(tables[EVENTS][0]).toMatchObject({
      eventId: 'g1',
      status: 'confirmed',
      title: 'Standup again',
    });
    expect((await cal.listOurs(window)).map(e => e.title)).toEqual(['Standup again']);
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
  const list = {id: '1', taskListId: 'inbox', title: 'Inbox', deleted: 0};

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

  const open = (title: string) => ({
    title,
    detail: '',
    due: null,
    completed: false,
  });

  test('a tablet with no list gets one list per project and an Inbox list (#212)', async () => {
    const {tables, rows} = provider();
    const tasks = createDeviceTasks(rows, () => NOW);
    await tasks.create(open('a'), {name: 'Inbox', inbox: true});
    await tasks.create(open('b'));
    await tasks.create(open('c'), {name: 'Habits', inbox: false});
    await tasks.create(open('d'), {name: 'Habits', inbox: false});
    expect(tables[GROUPS].map(g => g.title)).toEqual(['Inbox', 'Habits']);
    expect(tables[GROUPS][0]).toMatchObject({deleted: 0, hasSync: 0, createTime: NOW});
    const [inbox, habits] = tables[GROUPS].map(g => g.taskListId);
    expect(inbox).toEqual(expect.any(String));
    expect(inbox).not.toEqual(habits);
    expect(tables[TASKS].map(t => [t.title, t.taskListId])).toEqual([
      ['a', inbox],
      ['b', inbox],
      ['c', habits],
      ['d', habits],
    ]);
  });

  test('a project whose list exists reuses it; a deleted list of that name is not reused (#212)', async () => {
    const {tables, rows} = provider({
      [GROUPS]: [
        {id: '1', taskListId: 'old', title: 'Mirror', deleted: 1, userId: 'u1'},
        {id: '2', taskListId: 'habits', title: 'Habits', deleted: 0, userId: 'u1'},
      ],
    });
    const tasks = createDeviceTasks(rows, () => NOW);
    await tasks.create(open('stretch'), {name: 'Habits', inbox: false});
    await tasks.create(open('look'), {name: 'Mirror', inbox: false});
    expect(tables[GROUPS]).toHaveLength(3);
    const mirror = tables[GROUPS][2];
    expect(mirror).toMatchObject({title: 'Mirror', deleted: 0, userId: 'u1'});
    expect(mirror.taskListId).not.toBe('old');
    expect(tables[TASKS].map(t => t.taskListId)).toEqual(['habits', mirror.taskListId]);
  });

  test('a list the provider refuses fails the task instead of writing a lost row', async () => {
    const {rows} = provider();
    rows.insert = async () => {
      throw new Error('the provider refused the row');
    };
    const tasks = createDeviceTasks(rows, () => NOW);
    await expect(tasks.create(open('x'), {name: 'Habits', inbox: false})).rejects.toThrow('refused');
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
