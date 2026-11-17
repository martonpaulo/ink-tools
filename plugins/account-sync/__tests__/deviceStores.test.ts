/** The Calendar and To-Do stores over an in-memory content provider (#28, #29, #44). */
import type {Row} from '@supernote-tools/sn-adapter';
import {
  ContentRows,
  createDeviceCalendar,
  createDeviceTasks,
  serviceTaskId,
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

  test('updates and removes by its keys; an event with no tablet row throws', async () => {
    const {tables, rows} = provider();
    const cal = createDeviceCalendar(rows, () => NOW);
    await cal.create(event);
    await cal.update({...event, title: 'Planning'});
    expect(tables[EVENTS][0].title).toBe('Planning');
    await expect(cal.update({...event, eventId: 'gone'})).rejects.toThrow(
      'event gone has 0 tablet rows, not 1',
    );
    await cal.remove('work', 'g1');
    expect(tables[EVENTS]).toEqual([]);
    await expect(cal.remove('work', 'g1')).rejects.toThrow('0 tablet rows');
  });

  test('updates and removes by the row id, as a provider that honours only id needs (#213)', async () => {
    const {tables, rows} = provider({
      [EVENTS]: [
        // A native row that shares the event's ids but not our tag is never written.
        {id: '1', tag: 'event', calendarId: 'work', eventId: 'g1', title: 'Native'},
      ],
    });
    // The tablet's Calendar provider ignored a delete selected by `title` (#43): this one changes
    // nothing for a write selected by anything but the row id.
    const writes: Row[] = [];
    const byIdOnly: ContentRows = {
      ...rows,
      update: async (uri, where, row) => {
        writes.push(where);
        return Object.keys(where).join() === 'id' ? rows.update(uri, where, row) : 0;
      },
      remove: async (uri, where) => {
        writes.push(where);
        return Object.keys(where).join() === 'id' ? rows.remove(uri, where) : 0;
      },
    };
    const cal = createDeviceCalendar(byIdOnly, () => NOW);
    await cal.create(event);
    await cal.update({...event, title: 'Planning'});
    expect(tables[EVENTS].map(r => r.title)).toEqual(['Native', 'Planning']);
    await cal.remove('work', 'g1');
    expect(tables[EVENTS].map(r => r.id)).toEqual(['1']);
    expect(writes).toEqual([{id: '100'}, {id: '100'}]);
  });

  test('an event held by two tablet rows is an error, never a write', async () => {
    const {tables, rows} = provider();
    const cal = createDeviceCalendar(rows, () => NOW);
    await cal.create(event);
    await cal.create(event);
    await expect(cal.remove('work', 'g1')).rejects.toThrow('event g1 has 2 tablet rows, not 1');
    expect(tables[EVENTS]).toHaveLength(2);
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
  const open = (title: string) => ({
    title,
    detail: '',
    due: null,
    completed: false,
  });
  const habits = {name: 'Habits', inbox: false};

  test('writes every column a native insert fills, known by the taskId it writes (#212)', async () => {
    const {tables, rows} = provider({
      [GROUPS]: [{...list, title: 'Habits', taskListId: 'h'}],
    });
    const tasks = createDeviceTasks(rows, () => NOW);
    const made = await tasks.create(open('Buy milk'), habits, 'r9');
    expect(made).toMatchObject({
      localId: serviceTaskId('r9'),
      title: 'Buy milk',
      deleted: false,
    });
    const {id, ...row} = tables[TASKS][0];
    expect(id).toBe('100');
    expect(row).toEqual({
      taskListId: 'h',
      taskId: serviceTaskId('r9'),
      title: 'Buy milk',
      detail: '',
      status: 'needsAction',
      lastModified: NOW,
      dueTime: 0,
      completedTime: 0,
      isReminderOn: 0,
      deleted: 0,
      hasSync: 0,
      sort: 0,
      sortCompleted: 0,
      sortTime: NOW,
      plannedSort: 0,
      plannedSortTime: NOW,
    });
    expect((await tasks.list()).map(t => t.localId)).toEqual([
      serviceTaskId('r9'),
    ]);
  });

  test('a tablet with no list gets one list per project; Inbox tasks go to no list (#212)', async () => {
    const {tables, rows} = provider();
    const tasks = createDeviceTasks(rows, () => NOW);
    await tasks.create(open('a'), {name: 'Inbox', inbox: true});
    await tasks.create(open('b'));
    await tasks.create(open('c'), habits);
    await tasks.create(open('d'), habits);
    expect(tables[GROUPS]).toHaveLength(1);
    const {id, taskListId, ...group} = tables[GROUPS][0];
    expect(id).toEqual(expect.any(String));
    expect(group).toEqual({
      title: 'Habits',
      lastModified: NOW,
      createTime: NOW,
      deleted: 0,
      hasSync: 0,
    });
    expect(tables[TASKS].map(t => [t.title, t.taskListId])).toEqual([
      ['a', null],
      ['b', null],
      ['c', taskListId],
      ['d', taskListId],
    ]);
  });

  test('a project whose list exists reuses it; a deleted list of that name is not reused (#212)', async () => {
    const {tables, rows} = provider({
      [GROUPS]: [
        {id: '1', taskListId: 'old', title: 'Mirror', deleted: 1, userId: 'u1'},
        {
          id: '2',
          taskListId: 'habits',
          title: 'Habits',
          deleted: 0,
          userId: 'u1',
        },
      ],
    });
    const tasks = createDeviceTasks(rows, () => NOW);
    await tasks.create(open('stretch'), habits);
    await tasks.create(open('look'), {name: 'Mirror', inbox: false});
    expect(tables[GROUPS]).toHaveLength(3);
    const mirror = tables[GROUPS][2];
    expect(mirror).toMatchObject({title: 'Mirror', deleted: 0, userId: 'u1'});
    expect(mirror.taskListId).not.toBe('old');
    expect(tables[TASKS].map(t => t.taskListId)).toEqual([
      'habits',
      mirror.taskListId,
    ]);
  });

  test('a list the provider refuses fails the task instead of writing a lost row', async () => {
    const {rows} = provider();
    rows.insert = async () => {
      throw new Error('the provider refused the row');
    };
    const tasks = createDeviceTasks(rows, () => NOW);
    await expect(tasks.create(open('x'), habits)).rejects.toThrow('refused');
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

  describe('repairs the rows Account Sync beta 15 wrote (#212)', () => {
    const LATER = NOW + HOUR;
    const remote = (remoteId: string, title: string, inbox = false) => ({
      remoteId,
      ...open(title),
      modified: 1,
      list: {name: inbox ? 'Inbox' : 'Habits', inbox},
    });
    /** A beta 15 row: no taskId, deleted, sort and their siblings NULL, hasSync 0. */
    const hidden = (id: string, title: string, taskListId: string) => ({
      id,
      taskListId,
      taskId: null,
      title,
      detail: '',
      status: 'needsAction',
      lastModified: NOW,
      dueTime: null,
      completedTime: null,
      deleted: null,
      hasSync: 0,
      sort: null,
      sortCompleted: null,
      sortTime: null,
      plannedSort: null,
      plannedSortTime: null,
    });
    const beta15 = () =>
      provider({
        [GROUPS]: [
          {
            id: '1',
            taskListId: 'inktools19a1',
            title: 'Habits',
            deleted: 0,
            hasSync: 1,
          },
          {
            id: '2',
            taskListId: 'inktools19a2',
            title: 'Inbox',
            deleted: 0,
            hasSync: 1,
          },
          {
            id: '3',
            taskListId: 'native',
            title: 'Work',
            deleted: 0,
            hasSync: 1,
          },
        ],
        [TASKS]: [
          hidden('10', 'Stretch', 'inktools19a1'),
          hidden('11', 'Stretch', 'inktools19a1'),
          hidden('12', 'Call mum', 'inktools19a2'),
          hidden('13', 'Done since', 'inktools19a1'),
          // Rewritten by the native sync after the insert: shown, with its own taskId.
          {
            ...hidden('14', 'Walk', 'inktools19a1'),
            taskId: 'n14',
            hasSync: 1,
            ...{deleted: 0, isReminderOn: 0, dueTime: 0, completedTime: 0},
            ...{
              sort: 0,
              sortCompleted: 0,
              sortTime: NOW,
              plannedSort: 0,
              plannedSortTime: NOW,
            },
          },
          // The owner's own task in a native list, never touched.
          {
            ...hidden('15', 'Stretch', 'native'),
            taskId: 'n15',
            deleted: 0,
            hasSync: 1,
          },
        ],
      });
    const remotes = [
      remote('r1', 'Stretch'),
      remote('r2', 'Stretch'),
      remote('r3', 'Call mum', true),
      remote('r4', 'Walk'),
    ];

    test('with no stored link: every pulled row is shown, linked once, and the old Inbox list goes', async () => {
      const {tables, rows} = beta15();
      const tasks = createDeviceTasks(rows, () => LATER);
      const fix = await tasks.repair!(remotes, []);
      expect(fix.moved).toEqual({});
      expect(fix.found).toEqual([
        {remoteId: 'r1', localId: serviceTaskId('r1')},
        {remoteId: 'r2', localId: serviceTaskId('r2')},
        {remoteId: 'r3', localId: serviceTaskId('r3')},
        {remoteId: 'r4', localId: 'n14'},
      ]);
      const byId = (id: string) => tables[TASKS].find(t => t.id === id)!;
      expect(byId('10')).toMatchObject({
        taskId: serviceTaskId('r1'),
        taskListId: 'inktools19a1',
        deleted: 0,
        hasSync: 0,
        sort: 0,
        sortCompleted: 0,
        sortTime: LATER,
        plannedSort: 0,
        plannedSortTime: LATER,
        dueTime: 0,
        completedTime: 0,
        isReminderOn: 0,
        lastModified: NOW,
      });
      expect(byId('12')).toMatchObject({
        taskId: serviceTaskId('r3'),
        taskListId: null,
        deleted: 0,
      });
      // A hidden row whose service task is gone was never shown nor uploaded: removed.
      expect(tables[TASKS].find(t => t.id === '13')).toBeUndefined();
      expect(byId('14')).toMatchObject({taskId: 'n14', hasSync: 1});
      expect(byId('15')).toEqual({
        ...hidden('15', 'Stretch', 'native'),
        taskId: 'n15',
        deleted: 0,
        hasSync: 1,
      });
      expect(tables[GROUPS].map(g => [g.title, g.deleted, g.hasSync])).toEqual([
        ['Habits', 0, 1],
        ['Inbox', 1, 0],
        ['Work', 0, 1],
      ]);
      // A second repair changes nothing and finds nothing new for linked tasks.
      const before = JSON.stringify(tables);
      const again = await tasks.repair!(
        remotes,
        fix.found.map(f => ({...f, fingerprint: ''})),
      );
      expect(again).toEqual({moved: {}, found: []});
      expect(JSON.stringify(tables)).toBe(before);
    });

    test('with the links of the beta 15 pass: each link follows its row to the new taskId', async () => {
      const {tables, rows} = beta15();
      const tasks = createDeviceTasks(rows, () => LATER);
      const links = ['10', '11', '12', '13', '14'].map((localId, i) => ({
        remoteId: `r${i + 1}`,
        localId,
        fingerprint: '',
      }));
      const fix = await tasks.repair!(
        [...remotes, remote('r5', 'Done since')],
        links,
      );
      expect(fix.found).toEqual([]);
      expect(fix.moved['14']).toBe('n14');
      expect(fix.moved['10']).toMatch(/^inktools/);
      expect(new Set(Object.values(fix.moved)).size).toBe(5);
      expect(tables[TASKS]).toHaveLength(6);
      expect(tables[TASKS].every(t => t.deleted === 0)).toBe(true);
      const listed = (await tasks.list()).map(t => t.localId);
      expect(listed).toEqual(expect.arrayContaining(Object.values(fix.moved)));
    });

    test('a twin the native cloud sync made of a pulled row is soft-deleted, never sent (beta 18)', async () => {
      const shown = (id: string, title: string, taskId: string, due = 0) => ({
        ...hidden(id, title, 'inktools19a1'),
        taskId,
        hasSync: 1,
        deleted: 0,
        dueTime: due,
        completedTime: 0,
        isReminderOn: 0,
        ...{sort: 0, sortCompleted: 0, sortTime: NOW},
        ...{plannedSort: 0, plannedSortTime: NOW},
      });
      const titles = ['Stretch', 'Walk', 'Read', 'Water', 'Journal'];
      const {tables, rows} = provider({
        [GROUPS]: [
          {id: '1', taskListId: 'inktools19a1', title: 'Mirror', deleted: 0, hasSync: 1},
        ],
        [TASKS]: [
          // The 5 pulled rows, then their 5 twins with the native sync's own taskId, then the
          // owner's own task in the same list, with a title no pulled row has.
          ...titles.map((t, i) => shown(`${20 + i}`, t, serviceTaskId(`r${i + 1}`))),
          ...titles.map((t, i) => shown(`${30 + i}`, t, `native${i}`)),
          shown('40', 'Plant seeds', 'native9'),
          // Same title as a pulled row but another due time: not a twin.
          shown('41', 'Stretch', 'native8', NOW + 9 * HOUR),
        ],
      });
      const tasks = createDeviceTasks(rows, () => LATER);
      const services = titles.map((t, i) => ({
        ...remote(`r${i + 1}`, t),
        list: {name: 'Mirror', inbox: false},
      }));
      const fix = await tasks.repair!(services, []);
      expect(fix.found).toEqual(
        titles.map((_, i) => ({
          remoteId: `r${i + 1}`,
          localId: serviceTaskId(`r${i + 1}`),
        })),
      );
      const deleted = tables[TASKS].filter(t => t.deleted === 1).map(t => t.id);
      expect(deleted).toEqual(['30', '31', '32', '33', '34']);
      expect(tables[TASKS]).toHaveLength(12);
      expect(tables[TASKS].find(t => t.id === '30')).toMatchObject({
        lastModified: LATER,
        hasSync: 0,
      });
      const kept = (await tasks.list()).filter(t => !t.deleted);
      const linked = new Set(fix.found.map(f => f.localId));
      // Only the owner's two tasks stay tablet-only.
      expect(kept.filter(t => !linked.has(t.localId)).map(t => t.localId)).toEqual([
        'native9',
        'native8',
      ]);
      // A second repair finds the same pairs and deletes nothing more.
      const before = JSON.stringify(tables);
      const again = await tasks.repair!(services, fix.found.map(f => ({...f, fingerprint: ''})));
      expect(again).toEqual({moved: {}, found: []});
      expect(JSON.stringify(tables)).toBe(before);
    });

    test('a row whose taskId names its service task is found after a restart', async () => {
      const {rows} = provider();
      const tasks = createDeviceTasks(rows, () => NOW);
      await tasks.create(open('Stretch'), habits, 'r1');
      const fix = await tasks.repair!([remote('r1', 'Stretched')], []);
      expect(fix).toEqual({
        moved: {},
        found: [{remoteId: 'r1', localId: serviceTaskId('r1')}],
      });
    });
  });
});
