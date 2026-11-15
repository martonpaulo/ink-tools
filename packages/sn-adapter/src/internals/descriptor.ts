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
}

export interface TodoRules {
  requiredOnInsert: string[];
  needsExistingList: boolean;
  writeHasSync: number;
  statusOpen: string;
  statusCompleted: string;
  timeUnit: string;
}

export interface Descriptor {
  schema: number;
  descriptorVersion: string;
  calendar: ModuleDescriptor<CalendarRules>;
  todo: ModuleDescriptor<TodoRules>;
  digest: ModuleDescriptor;
}

type RuleType = 'string' | 'boolean' | 'number' | 'string[]';
const RULE_TYPES: Record<'calendar' | 'todo', Record<string, RuleType>> = {
  calendar: {writeTag: 'string'},
  todo: {requiredOnInsert: 'string[]', needsExistingList: 'boolean', writeHasSync: 'number', statusOpen: 'string', statusCompleted: 'string', timeUnit: 'string'},
};

/** The fields the adapter reads and writes in each table; an update that lacks one is refused (#101). */
const REQUIRED_FIELDS: Partial<Record<Capability, Record<string, string[]>>> = {
  calendar: {events: ['eventId', 'calendarId', 'tag', 'readOnly', 'allDay', 'title', 'content', 'start', 'end', 'modified']},
  todo: {tasks: ['rowId', 'listId', 'taskId', 'title', 'detail', 'modified', 'status', 'due', 'completedAt', 'deleted', 'hasSync']},
};

function hasType(value: unknown, type: RuleType): boolean {
  return type === 'string[]' ? Array.isArray(value) && value.every(v => typeof v === 'string') : typeof value === type;
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
    if (cap !== 'digest') {
      const rules = (m.rules ?? {}) as Record<string, unknown>;
      for (const [key, type] of Object.entries(RULE_TYPES[cap])) {
        if (!hasType(rules[key], type)) throw new Error(`${cap}: rule ${key} must be a ${type}`);
      }
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
