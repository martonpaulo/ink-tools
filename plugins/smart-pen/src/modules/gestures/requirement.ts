/**
 * What Gestures need, declared in data (the declared-dependency rule of #245): the shared folder's
 * file permissions, from the registry's `storage.shared-folder`, and Handwriting Language's
 * accessibility service, which presses NOTE's toolbar for Smart Pen. The rest of Smart Pen works
 * without either. A missing one shows Gestures as unavailable, with what is missing and the step
 * that fixes it; a check the host cannot answer is a failed check, never a met one.
 *
 * The service is known by its ready file in the shared folder, which `WritingWatcher` writes while
 * its service runs (the [mac] Task of #270). shortcut: a ready file left by a service that was
 * stopped without its cleanup reads as ready; upgrade with a heartbeat time in the file if a device
 * round sees that.
 */
import {copy} from './copy';

export type GestureRequirement =
  | {kind: 'permission'; permission: string}
  | {kind: 'service'; app: string; readyFile: string};

/** The ready file's name in the shared folder; WritingWatcher.java writes the same name. */
export const READY_FILE = 'handwriting-language-ready.json';
/** The request file's name in the shared folder; WritingWatcher.java reads the same name. */
export const REQUEST_FILE = 'tool-request.json';

export function gestureRequirements(
  sharedFolder: string,
  permissions: readonly string[],
): GestureRequirement[] {
  return [
    ...permissions.map(permission => ({kind: 'permission' as const, permission})),
    {
      kind: 'service',
      app: 'Handwriting Language',
      readyFile: `${sharedFolder}/${READY_FILE}`,
    },
  ];
}

type Answer<T> = {ok: true; value: T} | {ok: false; message: string};

export type RequirementPorts = {
  has(permission: string): Promise<Answer<boolean>>;
  /** The file's text, null when it does not exist. */
  read(path: string): Promise<Answer<string | null>>;
};

export type GestureCheck =
  | {kind: 'met'}
  | {kind: 'unmet'; missing: GestureRequirement[]}
  | {kind: 'failed'; reason: string};

export async function checkGestures(
  requirements: readonly GestureRequirement[],
  ports: RequirementPorts,
): Promise<GestureCheck> {
  const missing: GestureRequirement[] = [];
  for (const requirement of requirements) {
    if (requirement.kind === 'permission') {
      const held = await ports.has(requirement.permission);
      if (!held.ok) {
        return {kind: 'failed', reason: `hasPermission ${requirement.permission}: ${held.message}`};
      }
      if (!held.value) {
        missing.push(requirement);
      }
    } else {
      // Without the file permissions the ready file cannot be read: it counts as missing too.
      if (missing.length > 0) {
        missing.push(requirement);
        continue;
      }
      const ready = await ports.read(requirement.readyFile);
      if (!ready.ok) {
        return {kind: 'failed', reason: `read ${requirement.readyFile}: ${ready.message}`};
      }
      if (ready.value === null) {
        missing.push(requirement);
      }
    }
  }
  return missing.length > 0 ? {kind: 'unmet', missing} : {kind: 'met'};
}

/** The line Settings shows for a check: what Gestures need before first use, or why they are off. */
export function describeCheck(check: GestureCheck | null): {
  what: string;
  steps: string[];
} {
  if (check === null || check.kind === 'met') {
    return {what: copy['settings.needs'], steps: []};
  }
  if (check.kind === 'failed') {
    return {what: copy['settings.checkFailed'], steps: []};
  }
  const files = check.missing.some(need => need.kind === 'permission');
  const service = check.missing.some(need => need.kind === 'service');
  const missing = [
    ...(files ? [copy['missing.files']] : []),
    ...(service ? [copy['missing.service']] : []),
  ].join(', and ');
  return {
    what: copy['settings.unavailable'].replace('{missing}', missing),
    steps: [
      ...(files ? [copy['step.files']] : []),
      ...(service ? [copy['step.service']] : []),
    ],
  };
}
