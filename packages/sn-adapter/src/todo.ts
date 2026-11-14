import {Descriptor} from './descriptor';
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
  return {
    localId: String(row.taskId ?? row.id),
    title: String(row.title ?? ''),
    detail: String(row.detail ?? ''),
    due: asNumber(row.dueTime ?? null),
    completed: row.status === done || asNumber(row.completedTime ?? null) !== null,
    modified: asNumber(row.lastModified ?? null) ?? 0,
    deleted: row.deleted === 1 || row.deleted === '1' || row.deleted === true,
  };
}

/** The columns to write for a task's content; run the result through toTodoInsert for new rows. */
export function todoTaskToRow(
  d: Descriptor,
  task: Pick<TodoTask, 'title' | 'detail' | 'due' | 'completed'>,
  now: number,
): Row {
  const r = d.todo.rules;
  return {
    title: task.title,
    detail: task.detail,
    dueTime: task.due,
    status: (task.completed ? r.statusCompleted : r.statusOpen) as string,
    completedTime: task.completed ? now : null,
    lastModified: now,
  };
}
