import {Capability, Descriptor, column, contentUri} from './descriptor';

/** What the plugin runtime provides: one cheap, unfiltered query per table. No device logic here. */
export interface DeviceReader {
  /** Resolve with the column names the provider returns, or reject when the provider does not answer. */
  columnsOf(uri: string): Promise<string[]>;
  /**
   * Insert one test row with a marker text in `markerColumn` and delete the rows carrying it again,
   * as `plugins/probe` does (#67). Resolve when both passed; reject when the provider refuses the write.
   */
  dryInsert(uri: string, markerColumn: string): Promise<void>;
}

/**
 * The table each capability test-writes; reads passing says nothing about writes (#67). The Digest
 * has none: its provider refuses every delete to a plugin, so a test row would stay in the owner's
 * Digest and reach Supernote Cloud (#42, docs/research/2026-11-digest-provider.md).
 */
const WRITE_TABLE: Partial<Record<Capability, string>> = {calendar: 'events', todo: 'tasks'};
/** The text field of each write table that carries the test row's marker (#43), as `plugins/probe` marks it. */
const MARKER_FIELD: Partial<Record<Capability, string>> = {calendar: 'title', todo: 'title'};

/** Why a capability with no test write stays unable to write. */
export const NO_TEST_WRITE = 'no test write: the provider refuses deletes, so a test row would stay (#42)';

export interface CapabilityStatus {
  capability: Capability;
  /** Every table answered with the columns the descriptor lists. */
  available: boolean;
  /** A marked, reverted dry insert into the write table passed; false when reads failed first. */
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
  const marker = MARKER_FIELD[capability];
  if (available && (!table || !marker)) {
    problems.push(NO_TEST_WRITE);
  } else if (available && table && marker) {
    const uri = contentUri(module, table);
    try {
      await reader.dryInsert(uri, column(module, table, marker));
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
