/**
 * Where the device probe meets the sync (#101): sn-adapter's adapt-on/off check answers per
 * capability, and sync-core's `moduleStatus` blocks a module with problems (#67). The two packages
 * stay independent, so Bridge, the feature edge, translates one into the other.
 */
import {CAPABILITIES} from '@ink-tools/sn-adapter';
import type {Capability, CapabilityStatus, ProbeProblemKind} from '@ink-tools/sn-adapter';
import type {BridgeSettings, ModuleId, ProbeProblems} from '@ink-tools/sync-core';
import {format} from './copy';

/** Bridge's module for each capability the descriptor names; they share their names today. */
const MODULE_OF: Record<CapabilityStatus['capability'], ModuleId> = {
  calendar: 'calendar',
  todo: 'todo',
  digest: 'digest',
};

/**
 * The probe's problems per module, one plain sentence per kind (#67, #417): one that reads and writes
 * has none. The sentences name no provider, table or column; `probeDetails` keeps those for the log.
 */
export function probeProblems(statuses: CapabilityStatus[]): ProbeProblems {
  const problems: ProbeProblems = {};
  for (const status of statuses) {
    const module = MODULE_OF[status.capability];
    const app = format(`app.${module}`);
    // A problem with no kind, or a blocked status with no problem, still reads as one sentence:
    // a blocked module never shows an empty reason (#417).
    const kinds = status.problems.map(
      (_, index): ProbeProblemKind | 'unknown' => status.kinds[index] ?? 'unknown',
    );
    problems[module] = cleared(status)
      ? []
      : [...new Set(kinds.length ? kinds : (['unknown'] as const))].map(kind => format(`probe.${kind}`, {app}));
  }
  return problems;
}

/** The probe's details per module, for the log only: the provider, the table and the columns. */
export function probeDetails(statuses: CapabilityStatus[]): ProbeProblems {
  const details: ProbeProblems = {};
  for (const status of statuses) {
    details[MODULE_OF[status.capability]] = cleared(status) ? [] : [...status.problems];
  }
  return details;
}

const cleared = (status: CapabilityStatus) => status.available && status.canWrite;

/** The capabilities of the modules that are on: a module that is off is never probed (#43). */
export function capabilitiesOf(settings: BridgeSettings): Capability[] {
  return CAPABILITIES.filter(c => settings.modules[MODULE_OF[c]]);
}
