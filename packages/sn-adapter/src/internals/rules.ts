import {Descriptor, column} from './descriptor';

export type Row = Record<string, string | number | boolean | null>;

/** Keep only columns the descriptor knows for a table; the provider rejects unknown ones with id -1. */
function pickColumns(columns: string[], row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (columns.includes(k)) out[k] = v;
  return out;
}

/** A calendar event the plugin writes carries the descriptor's tag (`tag=task`), so the app shows it. */
export function toCalendarInsert(d: Descriptor, event: Row): Row {
  const row = pickColumns(d.calendar.tables.events.columns, event);
  row[column(d.calendar, 'events', 'tag')] = d.calendar.rules.writeTag;
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
