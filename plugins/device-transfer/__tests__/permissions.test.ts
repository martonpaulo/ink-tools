/** Relay asks for every permission it declares before its first call (#163). */
import {fail, ok} from '@ink-tools/sn-adapter/official';
import config from '../PluginConfig.json';
import {copy} from '../src/copy';
import {
  ensurePermissions,
  NEEDED,
  PermissionDeps,
  refusedLine,
} from '../src/permissions';
import {findForSend} from '../src/run';
import {fakeRelay} from '../test-support/fakeRelay';

function deps(granted: string[], answer = 2): PermissionDeps {
  return {
    has: jest.fn(async (permission: string) => ok(granted.includes(permission))),
    request: jest.fn(async () => ok(answer)),
    log: jest.fn(),
  };
}

test('every declared permission is requested in code, and only those', () => {
  expect([...NEEDED].sort()).toEqual([...config['uses-permissions']].sort());
  for (const permission of NEEDED) {
    expect(copy.permissionNames[permission]).toBeDefined();
  }
});

test('each permission not granted is requested, in order', async () => {
  const d = deps(['plugin.permission.INTERNET']);
  await expect(ensurePermissions(d)).resolves.toBeNull();
  expect((d.request as jest.Mock).mock.calls).toEqual([
    ['plugin.permission.FILE:READ', copy.permissionReason],
    ['plugin.permission.FILE:WRITE', copy.permissionReason],
  ]);
});

test('granted permissions ask nothing', async () => {
  const d = deps([...NEEDED]);
  await expect(ensurePermissions(d)).resolves.toBeNull();
  expect(d.request).not.toHaveBeenCalled();
});

test.each([0, -1])('an answer of %p is a refusal that stops the asking', async answer => {
  const d = deps([], answer);
  await expect(ensurePermissions(d)).resolves.toBe('plugin.permission.INTERNET');
  expect(d.request).toHaveBeenCalledTimes(1);
});

test('a failed hasPermission is asked, never taken as granted', async () => {
  const d = deps([]);
  d.has = jest.fn(async () => fail(-1, 'host'));
  await expect(ensurePermissions(d)).resolves.toBeNull();
  expect(d.request).toHaveBeenCalledTimes(NEEDED.length);
});

test('the refusal toast names the permission, never «Open a note first»', () => {
  const line = refusedLine('plugin.permission.FILE:READ');
  expect(line).toContain('File read');
  expect(line).not.toBe(copy.noNote);
});

test('a send with a refused permission makes no file and calls no network', async () => {
  const {api, native} = fakeRelay();
  const outcome = await findForSend(
    api,
    async () => 'plugin.permission.INTERNET',
    async () => ok('/plugin'),
  );
  expect(outcome).toEqual({kind: 'toast', text: refusedLine('plugin.permission.INTERNET')});
  expect(native.readText).not.toHaveBeenCalled();
  expect(native.post).not.toHaveBeenCalled();
});
