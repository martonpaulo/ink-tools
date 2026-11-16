/**
 * Relay's declared permissions, asked before the first file, note or network call (#163). The
 * host keeps a declared permission «Ask Every Time» until the plugin calls `requestPermission`,
 * and every file call fails until then (`docs/supernote.md` › Plugins). Each call and its answer
 * is logged, as the plugin skill's device rounds read them.
 */
import {
  hasPermission,
  isGranted,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  PERMISSION_INTERNET,
  requestPermission,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';

/** Every permission `PluginConfig.json` declares; `__tests__/permissions.test.ts` checks both match. */
export const NEEDED = [
  PERMISSION_INTERNET,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
] as const;

export type PermissionDeps = {
  has: typeof hasPermission;
  request: typeof requestPermission;
  log: (line: string) => void;
};

const DEVICE: PermissionDeps = {
  has: hasPermission,
  request: requestPermission,
  log: line => console.log(`Relay: ${line}`),
};

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
    const asked = await deps.request(permission, copy.permissionReason);
    deps.log(
      asked.ok
        ? `requestPermission ${permission}: ${asked.value}`
        : `requestPermission ${permission} failed: ${asked.code} ${asked.message}`,
    );
    if (!(asked.ok && isGranted(asked.value))) {
      return permission;
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
