/** The file permissions Retouch asks for when Settings opens (#136, #182). */
import {fail, ok, THROWN_CODE} from '@supernote-tools/sn-adapter/official';
import {askFilePermissions, PermissionDeps} from '../src/permissions';

function deps(granted: readonly string[]): PermissionDeps & {asked: string[]} {
  const asked: string[] = [];
  return {
    asked,
    has: jest.fn(async (permission: string) => ok(granted.includes(permission))),
    request: jest.fn(async (permission: string) => {
      asked.push(permission);
      return ok(1);
    }),
    log: () => {},
  } as unknown as PermissionDeps & {asked: string[]};
}

test('asks for read, write and delete, the last to remove dropped states (#182)', async () => {
  const d = deps([]);
  await askFilePermissions(d);
  expect(d.asked).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
    'plugin.permission.FILE:DELETE',
  ]);
});

test('asks only for a permission not yet granted', async () => {
  const d = deps(['plugin.permission.FILE:READ', 'plugin.permission.FILE:WRITE']);
  await askFilePermissions(d);
  expect(d.asked).toEqual(['plugin.permission.FILE:DELETE']);
});

test('a failed check still asks, and a failed request is logged', async () => {
  const lines: string[] = [];
  const d: PermissionDeps = {
    has: jest.fn(async () => fail(THROWN_CODE, 'no host')),
    request: jest.fn(async () => fail(THROWN_CODE, 'refused')),
    log: (line: string) => lines.push(line),
  } as unknown as PermissionDeps;
  await askFilePermissions(d);
  expect(d.request).toHaveBeenCalledTimes(3);
  expect(lines[2]).toBe(`request plugin.permission.FILE:DELETE failed: ${THROWN_CODE} refused`);
});
