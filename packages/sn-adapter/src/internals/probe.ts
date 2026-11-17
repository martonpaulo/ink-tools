import {Capability, Descriptor, column, contentUri} from './descriptorModel';
import {Row} from './rules';

/** What the plugin runtime provides: one cheap, unfiltered query per table. No device logic here. */
export interface DeviceReader {
  /** Resolve with the column names the provider returns, or reject when the provider does not answer. */
  columnsOf(uri: string): Promise<string[]>;
  /**
   * Update the rows whose columns equal `where` with `values`, and resolve with the number changed;
   * reject when the provider refuses the write. The probe passes a `where` that matches none of the
   * owner's rows, so the test write inserts nothing and changes nothing of the owner's (#43).
   */
  testWrite(uri: string, where: Row, values: Row): Promise<number>;
}

/**
 * The table each capability test-writes; reads passing says nothing about writes (#67). The Digest
 * has none: its provider refuses every delete to a plugin, so a test row would stay in the owner's
 * Digest and reach Supernote Cloud (#42, docs/research/2026-11-digest-provider.md).
 */
const WRITE_TABLE: Partial<Record<Capability, string>> = {calendar: 'events', todo: 'tasks'};

/**
 * The text that Account Sync 0.1.0 beta 11 to beta 16 wrote in the title and the calendar id of each
 * test row they inserted. The Calendar provider never deletes a row (its delete is `return 0;`), so
 * those rows stayed (#43).
 */
export const DRY_INSERT_MARKER = 'Account Sync dry insert';

/**
 * Each capability's test write: an update, never an insert, since the Calendar provider cannot
 * delete a test row again (#43). The Calendar's `where` matches only the test rows older builds
 * left, and marks them `cancelled`, as the native app removes a row; on a clean tablet it matches
 * nothing. The To-Do's `where` asks for the row id -1, which no row has.
 */
const TEST_WRITE: Partial<Record<Capability, (d: Descriptor) => {where: Row; values: Row}>> = {
  calendar: d => {
    const col = (field: string) => column(d.calendar, 'events', field);
    return {
      where: {
        [col('tag')]: d.calendar.rules.writeTag,
        [col('calendarId')]: DRY_INSERT_MARKER,
        [col('title')]: DRY_INSERT_MARKER,
      },
      values: {[col('status')]: d.calendar.rules.cancelledStatus},
    };
  },
  todo: d => {
    const col = (field: string) => column(d.todo, 'tasks', field);
    return {where: {[col('rowId')]: NO_ROW_ID}, values: {[col('title')]: DRY_INSERT_MARKER}};
  },
};

/** A row id no provider gives: the Supernote providers answer a refused insert with -1 (#63). */
const NO_ROW_ID = -1;

/** Why a capability with no test write stays unable to write. */
export const NO_TEST_WRITE = 'no test write: the provider refuses deletes, so a test row would stay (#42)';

export interface CapabilityStatus {
  capability: Capability;
  /** Every table answered with the columns the descriptor lists. */
  available: boolean;
  /** A test write into the write table passed; false when reads failed first. */
  canWrite: boolean;
  /** Human-readable reasons: provider silent, columns missing, or the write refused. */
  problems: string[];
}

/**
 * Adapt on/off: check the descriptor still matches the device. A mismatch turns the capability off
 * so a plugin disables that module instead of writing against a changed schema.
 */
export async function probeCapability(
  descriptor: Descriptor,
  capability: Capability,
  reader: DeviceReader,
): Promise<CapabilityStatus> {
  const module = descriptor[capability];
  const problems: string[] = [];
  for (const [name, table] of Object.entries(module.tables)) {
    const uri = contentUri(module, name);
    let actual: string[];
    try {
      actual = await reader.columnsOf(uri);
    } catch (e) {
      problems.push(`${uri} did not answer: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const missing = table.columns.filter(c => !actual.includes(c));
    if (missing.length) problems.push(`${uri} lacks columns: ${missing.join(', ')}`);
  }
  const available = problems.length === 0;
  // No write is tried against a schema that already failed to match.
  let canWrite = false;
  const table = WRITE_TABLE[capability];
  const write = TEST_WRITE[capability];
  if (available && (!table || !write)) {
    problems.push(NO_TEST_WRITE);
  } else if (available && table && write) {
    const uri = contentUri(module, table);
    const {where, values} = write(descriptor);
    try {
      await reader.testWrite(uri, where, values);
      canWrite = true;
    } catch (e) {
      problems.push(`${uri} refused a test write: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {capability, available, canWrite, problems};
}

export async function probeAll(descriptor: Descriptor, reader: DeviceReader): Promise<CapabilityStatus[]> {
  return Promise.all((['calendar', 'todo', 'digest'] as const).map(c => probeCapability(descriptor, c, reader)));
}
