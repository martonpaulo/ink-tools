import raw from './descriptor.json';

export type Capability = 'calendar' | 'todo' | 'digest';

export interface TableDescriptor {
  path: string;
  /** Columns the table must expose. Empty means "the table only has to answer". */
  columns: string[];
  /**
   * Our name for each column the adapter reads or writes, mapped to the device's column (#101), so a
   * renamed column is a descriptor update, never a code change.
   */
  fields?: Record<string, string>;
}

export interface ModuleDescriptor<Rules = Record<string, unknown>> {
  authority: string;
  tables: Record<string, TableDescriptor>;
  rules: Rules;
  permissions?: {read: string; write: string};
}

/** The rule keys the adapter reads; `parseDescriptor` refuses an update that lacks one (#84). */
export interface CalendarRules {
  writeTag: string;
  /** The `status` value the native app writes when it hides an event: the delete signal (#29). */
  cancelledStatus: string;
  /**
   * The `status` and `state` a written row carries: a native row holds `state` 0 and a `status` text
   * (one real `data_info` row, #43).
   * shortcut: `confirmed` is Google's word for a live event, beside its `cancelled`; the row read on
   * the tablet did not record its `status` text. Change this rule if a written row shows otherwise.
   */
  writeStatus: string;
  writeState: number;
  /**
   * The start of the `calendarId` text that links a pulled row to its source event (#28). The row's
   * `eventId` stays NULL: the Calendar app showed test rows with no `eventId` and hid the 217 pulled
   * rows that had one, with every other column of the same shape (an inference from the device
   * rounds of #43 and #28, not read in the app's code).
   */
  linkPrefix: string;
  /**
   * Device columns every inserted row fills: the provider's NOT NULL columns. `tag` and
   * `lastModifiedTime` are measured refusals; the others are every column a native row fills, as a
   * null there was never seen (#43).
   */
  requiredOnInsert: string[];
}

export interface TodoRules {
  requiredOnInsert: string[];
  /** A non-empty `taskListId` must name an open `task_group_table` row ("taskList is not Exist"). */
  needsExistingList: boolean;
  /** An empty `taskListId` is an unfiled task, the app's own Inbox (observed device behaviour of `DataBaseTools.insert`, #212). */
  allowNoList: boolean;
  writeHasSync: number;
  /**
   * The value a native insert gives each of these columns when the task has none. The app lists only
   * `deleted=0` rows, so a NULL there hides the task (device round of #212).
   */
  insertDefaults: Record<string, number>;
  /** Columns a native insert fills with the insert time, in `timeUnit`. */
  insertNow: string[];
  statusOpen: string;
  statusCompleted: string;
  timeUnit: string;
}

/** The Digest's write rules, read in `KnowledgeContentProvider` (docs/research/2026-11-digest-provider.md, #42). */
export interface DigestRules {
  /** Path of the one insert a plugin may call; the `knowledge` read path refuses inserts. */
  insertPath: string;
  /** Path that answers one `count` column for the identifier appended to it. */
  countByIdentifierPath: string;
  updateByIdentifierPath: string;
  /** The ContentValues key that names the entry an update by identifier changes. */
  updateIdentifierKey: string;
  /** The key inside `metadata` the provider keeps as the entry's identifier. */
  identifierKey: string;
  /** `source_type` of an entry with no note or document behind it («custom source» in the list). */
  sourceTypeSelfAdd: number;
  contentMaxLength: number;
  commentMaxLength: number;
}

export interface Descriptor {
  schema: number;
  descriptorVersion: string;
  calendar: ModuleDescriptor<CalendarRules>;
  todo: ModuleDescriptor<TodoRules>;
  digest: ModuleDescriptor<DigestRules>;
}

type RuleType = 'string' | 'boolean' | 'number' | 'string[]' | 'number-map';
const RULE_TYPES: Record<Capability, Record<string, RuleType>> = {
  calendar: {writeTag: 'string', cancelledStatus: 'string', writeStatus: 'string', writeState: 'number', linkPrefix: 'string', requiredOnInsert: 'string[]'},
  todo: {requiredOnInsert: 'string[]', needsExistingList: 'boolean', allowNoList: 'boolean', writeHasSync: 'number', insertDefaults: 'number-map', insertNow: 'string[]', statusOpen: 'string', statusCompleted: 'string', timeUnit: 'string'},
  digest: {insertPath: 'string', countByIdentifierPath: 'string', updateByIdentifierPath: 'string', updateIdentifierKey: 'string', identifierKey: 'string', sourceTypeSelfAdd: 'number', contentMaxLength: 'number', commentMaxLength: 'number'},
};

/** The fields the adapter reads and writes in each table; an update that lacks one is refused (#101). */
const REQUIRED_FIELDS: Partial<Record<Capability, Record<string, string[]>>> = {
  calendar: {events: ['rowId', 'eventId', 'calendarId', 'tag', 'readOnly', 'allDay', 'title', 'content', 'start', 'end', 'startDate', 'endDate', 'modified', 'status', 'state']},
  todo: {tasks: ['rowId', 'listId', 'taskId', 'title', 'detail', 'modified', 'status', 'due', 'completedAt', 'deleted', 'hasSync'], groups: ['rowId']},
  digest: {knowledge: ['content', 'collection', 'sourceType', 'metadata', 'comment', 'created']},
};

function hasType(value: unknown, type: RuleType): boolean {
  if (type === 'string[]') return Array.isArray(value) && value.every(v => typeof v === 'string');
  if (type === 'number-map') {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'number');
  }
  return typeof value === type;
}

export const SUPPORTED_SCHEMA = 1;

/** The descriptor shipped with the package. A newer one can replace it without a plugin release. */
export const BUNDLED_DESCRIPTOR = raw as unknown as Descriptor;

/** Validate a descriptor loaded from outside (an update). Throws with the first problem found. */
export function parseDescriptor(value: unknown): Descriptor {
  const d = value as Descriptor;
  if (!d || typeof d !== 'object') throw new Error('descriptor is not an object');
  if (d.schema !== SUPPORTED_SCHEMA) {
    throw new Error(`descriptor schema ${String(d.schema)} is not supported (expected ${SUPPORTED_SCHEMA})`);
  }
  for (const cap of ['calendar', 'todo', 'digest'] as const) {
    const m = d[cap];
    if (!m || typeof m.authority !== 'string' || !m.authority) throw new Error(`${cap}: missing authority`);
    if (!m.tables || !Object.keys(m.tables).length) throw new Error(`${cap}: no tables`);
    for (const [name, t] of Object.entries(m.tables)) {
      if (typeof t.path !== 'string' || !Array.isArray(t.columns)) throw new Error(`${cap}.${name}: bad table`);
      for (const [field, mapped] of Object.entries(t.fields ?? {})) {
        if (!t.columns.includes(mapped)) throw new Error(`${cap}.${name}: field ${field} names ${String(mapped)}, not a listed column`);
      }
    }
    for (const [name, fields] of Object.entries(REQUIRED_FIELDS[cap] ?? {})) {
      const t = m.tables[name];
      if (!t) throw new Error(`${cap}: missing table ${name}`);
      for (const field of fields) {
        if (!t.fields || typeof t.fields[field] !== 'string') throw new Error(`${cap}.${name}: missing field ${field}`);
      }
    }
    const rules = (m.rules ?? {}) as unknown as Record<string, unknown>;
    for (const [key, type] of Object.entries(RULE_TYPES[cap])) {
      if (!hasType(rules[key], type)) throw new Error(`${cap}: rule ${key} must be a ${type}`);
    }
  }
  return d;
}

/** The device column for one of our field names (#101); a field the table does not map throws. */
export function column(m: ModuleDescriptor<unknown>, table: string, field: string): string {
  const name = m.tables[table]?.fields?.[field];
  if (!name) throw new Error(`no column for ${table}.${field}`);
  return name;
}

export function contentUri(m: ModuleDescriptor<unknown>, table: string): string {
  const t = m.tables[table];
  if (!t) throw new Error(`unknown table ${table}`);
  return `content://${m.authority}/${t.path}`;
}

/** Which descriptor a plugin runs with, and why, so a refused update is reported, never silent. */
export interface DescriptorChoice {
  descriptor: Descriptor;
  source: 'bundled' | 'update';
  /** Why the bundled descriptor was kept; absent when the update was taken. */
  reason?: string;
}

/** `descriptorVersion` is a date, `YYYY.MM.DD`; anything else is not comparable. */
const VERSION = /^(\d{4})\.(\d{2})\.(\d{2})$/;

/**
 * Take an updated descriptor (its raw JSON text) only when it is valid and newer than the bundled
 * one; otherwise keep the bundled one and say why (#43).
 */
export function chooseDescriptor(
  update: string | undefined,
  bundled: Descriptor = BUNDLED_DESCRIPTOR,
): DescriptorChoice {
  const keep = (reason: string): DescriptorChoice => ({descriptor: bundled, source: 'bundled', reason});
  if (update === undefined || update.trim() === '') return keep('no update');
  let value: unknown;
  try {
    value = JSON.parse(update);
  } catch {
    return keep('the update is not JSON');
  }
  let candidate: Descriptor;
  try {
    candidate = parseDescriptor(value);
  } catch (error) {
    return keep(`the update was rejected: ${(error as Error).message}`);
  }
  if (!VERSION.test(String(candidate.descriptorVersion))) {
    return keep(`the update's version ${String(candidate.descriptorVersion)} is not YYYY.MM.DD`);
  }
  // Same-width dates compare as text.
  if (candidate.descriptorVersion <= bundled.descriptorVersion) {
    return keep(`the update ${candidate.descriptorVersion} is not newer than ${bundled.descriptorVersion}`);
  }
  return {descriptor: candidate, source: 'update'};
}
