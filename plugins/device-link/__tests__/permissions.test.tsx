/** Relay asks for every permission it declares before its first call (#163). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {WorkingStrip} from '@ink-tools/ui-kit';
import {pressables, quietWorking, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {fail, ok} from '@ink-tools/sn-adapter/official';
import config from '../PluginConfig.json';
import {copy} from '../src/copy';
import {
  ensurePermissions,
  NEEDED,
  PermissionDeps,
  refusedLine,
  refusedProblem,
} from '../src/permissions';
import {findForSend} from '../src/run';
import {fakeRelay} from '../test-support/fakeRelay';

function deps(granted: string[], answer = 2, refusedBefore = false): PermissionDeps {
  return {
    refusedBefore: jest.fn(async () => refusedBefore),
    rememberRefusal: jest.fn(async () => {}),
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
    ['plugin.permission.FILE:DELETE', copy.permissionReason],
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

test('a refused delete permission stops nothing: the text copy only stays (#593)', async () => {
  const d = deps(['plugin.permission.INTERNET', 'plugin.permission.FILE:READ', 'plugin.permission.FILE:WRITE'], 0);
  await expect(ensurePermissions(d)).resolves.toBeNull();
  expect((d.request as jest.Mock).mock.calls).toEqual([['plugin.permission.FILE:DELETE', copy.permissionReason]]);
});

test('a refused delete is remembered, and a remembered refusal is never asked again, so the host dialog shows once (#593)', async () => {
  const held = ['plugin.permission.INTERNET', 'plugin.permission.FILE:READ', 'plugin.permission.FILE:WRITE'];
  const first = deps(held, 0);
  await expect(ensurePermissions(first)).resolves.toBeNull();
  expect(first.rememberRefusal).toHaveBeenCalledWith('plugin.permission.FILE:DELETE');
  const next = deps(held, 0, true);
  await expect(ensurePermissions(next)).resolves.toBeNull();
  expect(next.request).not.toHaveBeenCalled();
  expect(next.rememberRefusal).not.toHaveBeenCalled();
});

test('a granted delete remembers no refusal, and a refusal of a needed permission is asked every time', async () => {
  const granted = deps([]);
  await ensurePermissions(granted);
  expect(granted.rememberRefusal).not.toHaveBeenCalled();
  const needed = deps([], 0, true);
  await expect(ensurePermissions(needed)).resolves.toBe('plugin.permission.INTERNET');
  expect(needed.request).toHaveBeenCalledTimes(1);
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
  expect(outcome).toEqual({kind: 'needs', problem: refusedProblem('plugin.permission.INTERNET')});
  expect(native.readText).not.toHaveBeenCalled();
  expect(native.post).not.toHaveBeenCalled();
});

test('a refused permission shows the Needs state with its steps and Close (#256)', async () => {
  const working = quietWorking({failed: 'Failed.', timeout: 'Still working.'});
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<WorkingStrip working={working} />);
  });
  act(() => {
    working.hold(refusedProblem('plugin.permission.FILE:READ'), 'needs');
  });
  expect(tree.root.findAllByProps({testID: 'needs'}).length).toBeGreaterThan(0);
  const shown = shownTexts(tree.root);
  expect(shown).toContain(copy.permissionNeeded('File read'));
  expect(shown).toContain('2. Allow File read.');
  expect(
    pressables(tree.root).length,
  ).toBeGreaterThan(0);
});
