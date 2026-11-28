/**
 * Relay's declared permissions, asked before the first file, note or network call (#163). The
 * host keeps a declared permission «Ask Every Time» until the plugin calls `requestPermission`,
 * and every file call fails until then (`docs/supernote.md` › Plugins). Each call and its answer
 * is logged, as the plugin skill's device rounds read them.
 */
import {
  hasPermission,
  isGranted,
  PERMISSION_FILE_DELETE,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  PERMISSION_INTERNET,
  requestPermission,
} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import {copy} from './copy';
import {relay} from './native';
import {loadSettings, saveSettings} from './settings/device';

/** Every permission `PluginConfig.json` declares; `__tests__/permissions.test.tsx` checks both match. */
export const NEEDED = [
  PERMISSION_INTERNET,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  PERMISSION_FILE_DELETE,
] as const;

/**
 * The permissions a refusal does not stop: the delete only removes the copy a long received text
 * saved beside the note, so a person who refuses it still sends and receives, and the copy stays
 * (tablet row 141, #593).
 */
const OPTIONAL: readonly string[] = [PERMISSION_FILE_DELETE];

export type PermissionDeps = {
  has: typeof hasPermission;
  request: typeof requestPermission;
  log: (line: string) => void;
  /**
   * Whether the person refused this optional permission before. The host shows its own «Unable to
   * Delete Files» dialog at every `requestPermission` of a refused one, and `hasPermission` cannot
   * tell a refusal from «Ask Every Time», so a refusal is remembered and not asked again (#593).
   * shortcut: a permission set back to «Ask Every Time» in Settings is not asked again either;
   * allowing it there still works, as `hasPermission` then answers true.
   */
  refusedBefore: (permission: string) => Promise<boolean>;
  rememberRefusal: (permission: string) => Promise<void>;
};

const DEVICE: PermissionDeps = {
  has: hasPermission,
  request: requestPermission,
  log: line => console.log(`Relay: ${line}`),
  refusedBefore: async () => (await loadSettings(relay())).deleteRefused,
  rememberRefusal: async () => {
    const native = relay();
    await saveSettings(native, {...(await loadSettings(native)), deleteRefused: true});
  },
};

/** Whether the host lets the plugin delete a file now; a read, never a dialog (#593). */
export async function holdsDelete(deps: PermissionDeps = DEVICE): Promise<boolean> {
  return held(PERMISSION_FILE_DELETE, deps);
}

/**
 * Asks for each permission the host has not granted, in order; answers the first one the person
 * refused, or null when all are granted. A failed `hasPermission` counts as not granted.
 */
export async function ensurePermissions(
  deps: PermissionDeps = DEVICE,
): Promise<string | null> {
  for (const permission of NEEDED) {
    if (await held(permission, deps)) {
      continue;
    }
    if (OPTIONAL.includes(permission) && (await deps.refusedBefore(permission))) {
      deps.log(`${permission} refused before: not asked again`);
      continue;
    }
    const asked = await deps.request(permission, copy.permissionReason);
    deps.log(
      asked.ok
        ? `requestPermission ${permission}: ${asked.value}`
        : `requestPermission ${permission} failed: ${asked.code} ${asked.message}`,
    );
    if (!(asked.ok && isGranted(asked.value))) {
      if (!OPTIONAL.includes(permission)) {
        return permission;
      }
      if (asked.ok) {
        await deps.rememberRefusal(permission);
      }
    }
  }
  return null;
}

async function held(permission: string, deps: PermissionDeps): Promise<boolean> {
  const granted = await deps.has(permission);
  deps.log(
    granted.ok
      ? `hasPermission ${permission}: ${granted.value}`
      : `hasPermission ${permission} failed: ${granted.code} ${granted.message}`,
  );
  return granted.ok && granted.value;
}

/** On each launch: logs which permissions the host holds, asking nothing. */
export async function logPermissions(deps: PermissionDeps = DEVICE): Promise<void> {
  for (const permission of NEEDED) {
    await held(permission, deps);
  }
}

/** The toast for a refused permission: it names it, never «Open a note first». */
export function refusedLine(permission: string): string {
  return copy.permissionRefused(copy.permissionNames[permission] ?? permission);
}

/** The Needs state of a refused permission (#256): its name, why it is needed, the steps that allow it. */
export function refusedProblem(permission: string): Problem {
  const name = copy.permissionNames[permission] ?? permission;
  return {
    what: copy.permissionNeeded(name),
    reason: copy.permissionReason,
    fix: {steps: copy.permissionSteps(name)},
  };
}
