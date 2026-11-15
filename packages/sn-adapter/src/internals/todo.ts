import {Descriptor, column} from './descriptor';
import {Row} from './rules';

/** Structurally the same shape as sync-core's DeviceTask, so the two packages stay independent. */
export interface TodoTask {
  localId: string;
  title: string;
  detail: string;
  due: number | null;
  completed: boolean;
  modified: number;
  deleted: boolean;
}

const asNumber = (v: Row[string]): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Read a tasks_table row. The status words, the time unit and the `deleted` flag are the
 * descriptor's rules; their values are assumptions until the owner checks a round trip on the
 * tablet (issue #44), and a firmware change only needs a descriptor update.
 */
export function rowToTodoTask(d: Descriptor, row: Row): TodoTask {
  const done = d.todo.rules.statusCompleted;
  const get = (field: string) => row[column(d.todo, 'tasks', field)];
  const id = get('taskId') ?? get('rowId');
  if (id === null || id === undefined || id === '') throw new Error('to-do row has no taskId'); // not the id "undefined" (#70)
  const deleted = get('deleted');
  return {
    localId: String(id),
    title: String(get('title') ?? ''),
    detail: String(get('detail') ?? ''),
    due: asNumber(get('due') ?? null),
    completed: get('status') === done || asNumber(get('completedAt') ?? null) !== null,
    modified: asNumber(get('modified') ?? null) ?? 0,
    deleted: deleted === 1 || deleted === '1' || deleted === true,
  };
}

/** The columns to write for a task's content; run the result through toTodoInsert for new rows. */
export function todoTaskToRow(
  d: Descriptor,
  task: Pick<TodoTask, 'title' | 'detail' | 'due' | 'completed'>,
  now: number,
): Row {
  const r = d.todo.rules;
  const col = (field: string) => column(d.todo, 'tasks', field);
  return {
    [col('title')]: task.title,
    [col('detail')]: task.detail,
    [col('due')]: task.due,
    [col('status')]: task.completed ? r.statusCompleted : r.statusOpen,
    [col('completedAt')]: task.completed ? now : null,
    [col('modified')]: now,
  };
}
