/**
 * Retouch keeps each picture's states in shared storage (src/edit.ts), so it needs FILE:READ and
 * FILE:WRITE. They are asked when Settings opens, as a no-view button cannot show the question;
 * a press without them fails at the first file call and is logged (#136).
 */
import {
  hasPermission,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  requestPermission,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';

export const NEEDED = [PERMISSION_FILE_READ, PERMISSION_FILE_WRITE] as const;

export type PermissionDeps = {
  has: typeof hasPermission;
  request: typeof requestPermission;
  log: (line: string) => void;
};

const DEVICE: PermissionDeps = {
  has: hasPermission,
  request: requestPermission,
  log: line => console.log(`Retouch: ${line}`),
};

/** Asks for each file permission not yet granted. */
export async function askFilePermissions(
  deps: PermissionDeps = DEVICE,
): Promise<void> {
  for (const permission of NEEDED) {
    const granted = await deps.has(permission);
    if (granted.ok && granted.value) {
      continue;
    }
    const asked = await deps.request(permission, copy['permission.files']);
    deps.log(
      asked.ok
        ? `request ${permission}: ${asked.value}`
        : `request ${permission} failed: ${asked.code} ${asked.message}`,
    );
  }
}
