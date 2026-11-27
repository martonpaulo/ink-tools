/**
 * What Puzzles needs before a game can go on the page, declared in data, never found only when a
 * game fails (#453, the declared-dependency rule of #245): the permissions `PluginConfig.json`
 * declares, their one owner, and each game's own `requires` in `games.ts`, checked when a game
 * opens. A missing one shows as ui-kit's Needs, with the one fix; a check that fails, as its Error.
 * shortcut: a permission is the only kind; the language pack and the page font's letters join
 * `Requirement` with the first word game (#454, #484, #502), as no shell code needs them.
 */
import {isGranted, type Result} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import config from '../PluginConfig.json';
import {copy} from './copy';

export type Requirement = {kind: 'permission'; permission: string};

/** The plugin's own requirements: every permission its PluginConfig.json declares. */
export const PLUGIN_REQUIREMENTS: readonly Requirement[] = config[
  'uses-permissions'
].map(permission => ({kind: 'permission' as const, permission}));

export type RequirementPorts = {
  has: (permission: string) => Promise<Result<boolean>>;
  request: (permission: string, reason: string) => Promise<Result<number>>;
  log: (line: string) => void;
};

export type Check =
  | {kind: 'met'}
  | {kind: 'unmet'; missing: Requirement[]}
  | {kind: 'failed'};

/**
 * Checks each requirement in order. A failed `hasPermission` is a failed check, never a granted
 * permission and never a missing one: the host could not answer.
 */
export async function checkRequirements(
  requirements: readonly Requirement[],
  ports: RequirementPorts,
): Promise<Check> {
  const missing: Requirement[] = [];
  for (const requirement of requirements) {
    const held = await ports.has(requirement.permission);
    if (!held.ok) {
      ports.log(`hasPermission ${requirement.permission} failed: ${held.code} ${held.message}`);
      return {kind: 'failed'};
    }
    ports.log(`hasPermission ${requirement.permission}: ${held.value}`);
    if (!held.value) {
      missing.push(requirement);
    }
  }
  return missing.length > 0 ? {kind: 'unmet', missing} : {kind: 'met'};
}

/** Asks the host for each missing permission in order; true when it granted every one. */
export async function askFor(
  missing: readonly Requirement[],
  ports: RequirementPorts,
): Promise<boolean> {
  let granted = true;
  for (const requirement of missing) {
    const asked = await ports.request(requirement.permission, copy['needs.files']);
    ports.log(
      asked.ok
        ? `requestPermission ${requirement.permission}: ${asked.value}`
        : `requestPermission ${requirement.permission} failed: ${asked.code} ${asked.message}`,
    );
    granted = granted && asked.ok && isGranted(asked.value);
  }
  return granted;
}

/** The missing permissions by the names Settings shows: «File read and File write». */
function names(missing: readonly Requirement[]): string {
  const shown = missing.map(need => copy.permissionNames[need.permission] ?? need.permission);
  return shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
    : shown.join('');
}

/**
 * The Needs state of an unmet check: «Allow» asks the host, then `granted` runs, or `refused`
 * with the steps only the person can take, as the host shows no dialog once a permission is refused.
 */
export function needsProblem(
  missing: readonly Requirement[],
  ports: RequirementPorts,
  then: {granted: () => void; refused: (problem: Problem) => void},
): Problem {
  return {
    what: copy.needsPermission(names(missing)),
    reason: copy['needs.files'],
    fix: {
      label: copy['needs.allow'],
      run: () => {
        askFor(missing, ports)
          .catch(error => {
            ports.log(`requestPermission failed: ${String(error)}`);
            return false;
          })
          .then(granted => (granted ? then.granted() : then.refused(refusedProblem(missing))));
      },
    },
  };
}

/** The Needs state once the host refused: the steps in Settings. */
export function refusedProblem(missing: readonly Requirement[]): Problem {
  return {
    what: copy.needsPermission(names(missing)),
    reason: copy['needs.files'],
    fix: {steps: copy.refusedSteps(names(missing))},
  };
}

/** The Error state of a check the host could not answer. */
export const CHECK_FAILED: Problem = {
  what: copy['error.check'],
  reason: copy['error.checkHint'],
};
