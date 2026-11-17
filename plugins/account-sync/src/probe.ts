/**
 * Where the device probe meets the sync (#101): sn-adapter's adapt-on/off check answers per
 * capability, and sync-core's `moduleStatus` blocks a module with problems (#67). The two packages
 * stay independent, so Bridge, the feature edge, translates one into the other.
 */
import type {CapabilityStatus} from '@ink-tools/sn-adapter';
import type {ModuleId, ProbeProblems} from '@ink-tools/sync-core';

/** Bridge's module for each capability the descriptor names; they share their names today. */
const MODULE_OF: Record<CapabilityStatus['capability'], ModuleId> = {
  calendar: 'calendar',
  todo: 'todo',
  digest: 'digest',
};

/** The probe's problems per module; one that reads and writes has none (#67). */
export function probeProblems(statuses: CapabilityStatus[]): ProbeProblems {
  const problems: ProbeProblems = {};
  for (const status of statuses) {
    problems[MODULE_OF[status.capability]] =
      status.available && status.canWrite
        ? []
      : [...status.problems];
  }
  return problems;
}
