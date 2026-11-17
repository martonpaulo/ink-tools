import {Descriptor, column} from './descriptorModel';

export type Row = Record<string, string | number | boolean | null>;

/** Keep only columns the descriptor knows for a table; the provider rejects unknown ones with id -1. */
function pickColumns(columns: string[], row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (columns.includes(k)) out[k] = v;
  return out;
}

/** SQLite's NOT NULL accepts an empty text, so an untitled event still writes. */
const missing = (v: Row[string] | undefined) => v === undefined || v === null;

/**
 * A calendar row the plugin writes: the descriptor's tag (`tag=task`), so the app shows it and the
 * native Google sync leaves it, and its `state` and `status`, unless the row names a status. Every
 * NOT NULL column of `data_info` (`rules.requiredOnInsert`) must be filled: the provider names one
 * at a time (`NOT NULL constraint failed`, #43), so a gap throws here instead.
 */
export function toCalendarInsert(d: Descriptor, event: Row): Row {
  const c = d.calendar;
  const row = pickColumns(c.tables.events.columns, event);
  row[column(c, 'events', 'tag')] = c.rules.writeTag;
  row[column(c, 'events', 'state')] = c.rules.writeState;
  const status = column(c, 'events', 'status');
  if (missing(row[status])) row[status] = c.rules.writeStatus;
  const gaps = c.rules.requiredOnInsert.filter(col => missing(row[col]));
  if (gaps.length) throw new Error(`calendar insert needs ${gaps.join(', ')}`);
  return row;
}

export interface TodoInsertContext {
  /** taskListId values of the non-deleted rows in task_group_table. */
  existingListIds: string[];
}

/** Build a To-Do row, enforcing the provider's insert rules. Throws instead of letting the insert fail with -1. */
export function toTodoInsert(d: Descriptor, task: Row, ctx: TodoInsertContext): Row {
  const t = d.todo;
  const row = pickColumns(t.tables.tasks.columns, task);
  for (const col of t.rules.requiredOnInsert) {
    if (row[col] === undefined || row[col] === null || row[col] === '') throw new Error(`To-Do insert needs ${col}`);
  }
  const list = row[column(t, 'tasks', 'listId')];
  if (t.rules.needsExistingList) {
    // A missing list fails like an unknown one: the provider would answer id -1 (#63).
    if (list === undefined || list === null || list === '') throw new Error('To-Do insert needs taskListId of an existing list');
    if (!ctx.existingListIds.includes(String(list))) throw new Error(`taskListId ${String(list)} does not match an existing list`);
  }
  row[column(t, 'tasks', 'hasSync')] = t.rules.writeHasSync; // 0 = the app uploads it to Supernote Cloud
  return row;
}
