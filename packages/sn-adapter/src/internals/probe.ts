import {Capability, Descriptor, column, contentUri} from './descriptorModel';
import {Row} from './rules';

/** What the plugin runtime provides: one cheap, unfiltered query per table. No device logic here. */
export interface DeviceReader {
  /** Resolve with the column names the provider returns, or reject when the provider does not answer. */
  columnsOf(uri: string): Promise<string[]>;
  /**
   * Update the rows whose columns equal `where` with `values`, and resolve with the number changed;
   * reject when the provider refuses the write (a `SecurityException` on the tablet). The probe's
   * `where` matches no row, so the test write changes nothing and inserts nothing (#43).
   */
  testWrite(uri: string, where: Row, values: Row): Promise<number>;
}

/**
 * The table each capability test-writes; reads passing says nothing about writes (#67). The Digest
 * has none: its provider refuses every delete to a plugin, and no update of it is known to be safe
 * (#42, docs/research/2026-11-digest-provider.md).
 */
const WRITE_TABLE: Partial<Record<Capability, string>> = {calendar: 'events', todo: 'tasks'};

/** A row id no provider gives: the Supernote providers answer a refused insert with -1 (#63). */
export const NO_ROW_ID = -1;

/**
 * Each capability's test write: an update selected by the row id -1, which matches no row, so the
 * provider runs its write path and its permission check and changes nothing. Never an insert: the
 * Calendar provider cannot delete a row again (its delete is `return 0;`), so every insert-based
 * probe left a «dry insert» row in the owner's Calendar (#43, #213). `values` is a column the
 * store's own writes set, so the test takes the path a real write takes.
 */
const TEST_WRITE: Partial<Record<Capability, (d: Descriptor) => {where: Row; values: Row}>> = {
  calendar: d => {
    const col = (field: string) => column(d.calendar, 'events', field);
    return {where: {[col('rowId')]: NO_ROW_ID}, values: {[col('status')]: d.calendar.rules.cancelledStatus}};
  },
  todo: d => {
    const col = (field: string) => column(d.todo, 'tasks', field);
    return {where: {[col('rowId')]: NO_ROW_ID}, values: {[col('hasSync')]: d.todo.rules.writeHasSync}};
  },
};

/** Why a capability with no test write stays unable to write. */
export const NO_TEST_WRITE = 'no test write: the provider refuses deletes, so a test row would stay (#42)';

/**
 * What kind of problem the probe found, in our words (#417): the provider was `silent`, its schema
 * `changed`, it `refused` the test write, the test write was `unsafe` (it changed a row), or there is
 * `noTestWrite` for it. A tool shows a sentence per kind; the detail goes only to the log.
 */
export type ProbeProblemKind = 'silent' | 'changed' | 'refused' | 'unsafe' | 'noTestWrite';

export interface CapabilityStatus {
  capability: Capability;
  /** Every table answered with the columns the descriptor lists. */
  available: boolean;
  /** A test write into the write table passed and changed no row; false when reads failed first. */
  canWrite: boolean;
  /** The log's details: provider silent, columns missing, or the write refused; never shown as they are. */
  problems: string[];
  /** Each problem's kind, in the order of `problems` (#417). */
  kinds: ProbeProblemKind[];
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
  const kinds: ProbeProblemKind[] = [];
  const add = (kind: ProbeProblemKind, detail: string) => {
    kinds.push(kind);
    problems.push(detail);
  };
  for (const [name, table] of Object.entries(module.tables)) {
    const uri = contentUri(module, name);
    let actual: string[];
    try {
      actual = await reader.columnsOf(uri);
    } catch (e) {
      add('silent', `${uri} did not answer: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const missing = table.columns.filter(c => !actual.includes(c));
    if (missing.length) add('changed', `${uri} lacks columns: ${missing.join(', ')}`);
  }
  const available = problems.length === 0;
  // No write is tried against a schema that already failed to match.
  let canWrite = false;
  const table = WRITE_TABLE[capability];
  const write = TEST_WRITE[capability];
  if (available && (!table || !write)) {
    add('noTestWrite', NO_TEST_WRITE);
  } else if (available && table && write) {
    const uri = contentUri(module, table);
    const {where, values} = write(descriptor);
    try {
      const changed = await reader.testWrite(uri, where, values);
      // The selection matches no row: a provider that changed one ignored it, so no write is safe.
      if (changed === 0) {
        canWrite = true;
      } else {
        add('unsafe', `${uri} changed ${changed} rows on a test write that selects none`);
      }
    } catch (e) {
      add('refused', `${uri} refused a test write: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {capability, available, canWrite, problems, kinds};
}

/** Every capability the descriptor holds, in the order `probeAll` answers. */
export const CAPABILITIES: readonly Capability[] = ['calendar', 'todo', 'digest'];

/** Probe each capability of `only`, every one by default; a plugin passes only the modules that are on. */
export async function probeAll(
  descriptor: Descriptor,
  reader: DeviceReader,
  only: readonly Capability[] = CAPABILITIES,
): Promise<CapabilityStatus[]> {
  return Promise.all(only.map(c => probeCapability(descriptor, c, reader)));
}
