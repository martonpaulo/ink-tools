import {Capability, Descriptor, contentUri} from './descriptor';

/** What the plugin runtime provides: one cheap, unfiltered query per table. No device logic here. */
export interface DeviceReader {
  /** Resolve with the column names the provider returns, or reject when the provider does not answer. */
  columnsOf(uri: string): Promise<string[]>;
  /**
   * Insert one marked test row and delete it again, as `plugins/probe` does (#67). Resolve when both
   * passed; reject when the provider refuses the write.
   */
  dryInsert(uri: string): Promise<void>;
}

/** The table each capability writes; reads passing says nothing about writes (#67). */
const WRITE_TABLE: Record<Capability, string> = {calendar: 'events', todo: 'tasks', digest: 'digest'};

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
  if (available) {
    const uri = contentUri(module, WRITE_TABLE[capability]);
    try {
      await reader.dryInsert(uri);
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
