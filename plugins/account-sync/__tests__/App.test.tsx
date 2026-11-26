/** Bridge's Settings view: the saved switches survive a restart (#40) and each module says its status (#88). */
import React from 'react';
import {NativeModules, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import {fail, ok, THROWN_CODE} from '@ink-tools/sn-adapter/official';
import {DEVICE_CHECK_PENDING} from '@ink-tools/sync-core';
import App from '../App';
import {copy} from '../src/copy';
import type {SyncRunner, SyncSnapshot} from '../src/sync';
import type {SecretProvider, SecretStore} from '@ink-tools/sync-core/secrets';
import {defaultSettings} from '@ink-tools/sync-core/settings';

const DIR = '/data/plugins/bridge';
const folder = async () => ok(DIR);
let files: Record<string, string>;
let refuseWrites: boolean;

beforeEach(() => {
  files = {};
  refuseWrites = false;
  NativeModules.BridgeFiles = {
    readText: async (p: string) => files[p] ?? null,
    writeText: async (p: string, t: string) => {
      if (refuseWrites) {
        throw new Error('disk full');
      }
      files[p] = t;
      return null;
    },
  };
});

async function mount(
  props: {
    folder?: () => Promise<
      ReturnType<typeof ok<string>> | ReturnType<typeof fail>
    >;
  } = {folder},
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App folder={props.folder as never} />);
  });
  return tree;
}
/** The switch or button with that spoken name: the outermost node that acts. */
const toggle = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    node =>
      ['switch', 'button'].includes(node.props.accessibilityRole) &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(n => n.props.children);

test('a change is saved and is still there after a restart (#40)', async () => {
  const first = await mount();
  await act(async () => toggle(first, 'Calendar').props.onPress());
  expect(JSON.parse(files[`${DIR}/settings.json`]).modules.calendar).toBe(true);
  act(() => first.unmount());
  const second = await mount();
  expect(toggle(second, 'Calendar').props.accessibilityState.checked).toBe(
    true,
  );
  expect(screenBreaks(second.root)).toEqual([]);
});

test('each module says whether it is off or why it does not run (#88)', async () => {
  const tree = await mount();
  expect(texts(tree)).toEqual(
    expect.arrayContaining([copy['module.calendar'], copy['status.off']]),
  );
  await act(async () => toggle(tree, 'Calendar').props.onPress());
  // Settings never probes (#43): Calendar waits for the device check of the next sync.
  expect(
    texts(tree).some(
      t =>
        typeof t === 'string' &&
        t.startsWith('On, but not running: ') &&
        t.includes(DEVICE_CHECK_PENDING),
    ),
  ).toBe(true);
});

test('a failed save is said on the screen; a failed load offers a retry', async () => {
  const tree = await mount();
  refuseWrites = true;
  await act(async () => toggle(tree, 'To-Do').props.onPress());
  expect(
    tree.root.findAllByProps({accessibilityRole: 'alert'})[0].props.children,
  ).toMatch(/not saved.*disk full/);
  const broken = await mount({
    folder: async () => fail(THROWN_CODE, 'getPluginDirPath returned nothing'),
  });
  expect(texts(broken)).toContain(
    'The settings did not load: getPluginDirPath returned nothing',
  );
});

/** A runner whose pass the test ends by hand, as `createSyncRunner` publishes it. */
function fakeRunner() {
  let snap: SyncSnapshot = {running: false, runs: {}, probe: {}};
  const listeners = new Set<(s: SyncSnapshot) => void>();
  const publish = (next: SyncSnapshot) => {
    snap = next;
    listeners.forEach(l => l(snap));
  };
  const runner: SyncRunner = {
    syncNow: jest.fn(async () => {
      publish({...snap, running: true});
      return snap;
    }),
    snapshot: () => snap,
    tabletOnlyTasks: async () => 94,
    subscribe: l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {runner, publish};
}

test('opening Settings and turning a module on never touches a provider; the runner\'s probe answer shows (#43)', async () => {
  const calls: string[] = [];
  NativeModules.BridgeProviders = new Proxy(
    {},
    {
      get: (_target, name) => async () => {
        calls.push(String(name));
        return [];
      },
    },
  );
  const {runner, publish} = fakeRunner();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App folder={folder as never} sync={runner} />);
  });
  await act(async () => toggle(tree, 'Calendar').props.onPress());
  expect(calls).toEqual([]);
  expect(runner.syncNow).not.toHaveBeenCalled();
  await act(async () =>
    publish({running: false, runs: {}, probe: {calendar: []}}),
  );
  expect(texts(tree)).toContain(copy['status.waiting']);
  delete NativeModules.BridgeProviders;
});

test('Sync now runs the plugin host runner and its run shows under the module (#28, #40)', async () => {
  const {runner, publish} = fakeRunner();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App folder={folder as never} sync={runner} />);
  });
  await act(async () => toggle(tree, 'Calendar').props.onPress());
  await act(async () => toggle(tree, copy['sync.button']).props.onPress());
  expect(runner.syncNow).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain(copy['sync.running']);
  expect(
    toggle(tree, copy['sync.button']).props.accessibilityState.disabled,
  ).toBe(true);
  const at = new Date(2026, 10, 16, 22, 15).getTime();
  await act(async () =>
    publish({
      running: false,
      probe: {calendar: []},
      runs: {
        calendar: {
          module: 'calendar',
          at,
          counts: {added: 2, changed: 0, removed: 0},
          errors: [],
          warnings: [],
        },
      },
    }),
  );
  expect(texts(tree)).toEqual(
    // The module's status lines are its row's grey subtitle, one line each (#274).
    expect.arrayContaining([
      'Last synced 2026-11-16 22:15.\n2 added, 0 changed, 0 removed',
    ]),
  );
  expect(screenBreaks(tree.root)).toEqual([]);
});

test('Close and Back close Settings, and do nothing while a pass runs (#204, #266)', async () => {
  const back = catchBackKey();
  const {runner, publish} = fakeRunner();
  const close = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <App folder={folder as never} sync={runner} close={close} />,
    );
  });
  const pressClose = () =>
    act(() =>
      tree.root
        .findAll(node => node.props.accessibilityLabel === 'Close' && node.props.onPress)[0]
        .props.onPress(),
    );
  await act(async () => publish({running: true, runs: {}, probe: {}}));
  expect(back.press()).toBe(true);
  pressClose();
  expect(close).not.toHaveBeenCalled();
  await act(async () => publish({running: false, runs: {}, probe: {}}));
  expect(back.press()).toBe(true);
  pressClose();
  expect(close).toHaveBeenCalledTimes(2);
  back.restore();
});

/** Mounts the given App and lets its first reads settle. */
async function mountApp(app: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(app);
  });
  return tree;
}

test('Settings shows whether Todoist is signed in and signs it out (#116)', async () => {
  const stored: Partial<Record<SecretProvider, string>> = {todoist: 'synthetic-token-wxyz'};
  const secrets: SecretStore = {
    read: async provider => stored[provider] ?? null,
    remove: jest.fn(async provider => {
      delete stored[provider];
    }),
  };
  const base = defaultSettings();
  files[`${DIR}/settings.json`] = JSON.stringify({
    ...base,
    modules: {...base.modules, todo: true},
    providers: {...base.providers, todoist: true},
  });
  const tree = await mountApp(<App folder={folder as never} secrets={secrets} />);
  expect(texts(tree)).toContain('Todoist: signed in (…wxyz).');
  const press = (label: string) =>
    tree.root.findAll(
      n =>
        (n.props.accessibilityLabel === label || n.props.label === label) &&
        typeof n.props.onPress === 'function',
    )[0];
  await act(async () => press('Sign out of Todoist').props.onPress());
  await act(async () => press(copy['signOut.yes']).props.onPress());
  expect(secrets.remove).toHaveBeenCalledWith('todoist');
  expect(texts(tree)).toContain('Todoist: not connected.');
  expect(press('Connect Todoist')).toBeDefined();
  expect(screenBreaks(tree.root)).toEqual([]);
});

test('a sign-out that fails says so in one sentence and logs why (#116)', async () => {
  const secrets: SecretStore = {
    read: async () => 'synthetic-token-wxyz',
    remove: async () => {
      throw new Error('the file module cannot delete a file');
    },
  };
  const base = defaultSettings();
  files[`${DIR}/settings.json`] = JSON.stringify({
    ...base,
    modules: {...base.modules, todo: true},
    providers: {...base.providers, todoist: true},
  });
  const log = jest.fn();
  const tree = await mountApp(<App folder={folder as never} secrets={secrets} log={log} />);
  const press = (label: string) =>
    tree.root.findAll(
      n =>
        (n.props.accessibilityLabel === label || n.props.label === label) &&
        typeof n.props.onPress === 'function',
    )[0];
  await act(async () => press('Sign out of Todoist').props.onPress());
  await act(async () => press(copy['signOut.yes']).props.onPress());
  expect(texts(tree)).toContain('The Todoist sign-out did not finish. Try again.');
  expect(log).toHaveBeenCalledWith(
    '[Bridge] sign-out: todoist: the file module cannot delete a file',
  );
});

test('a module that is on offers Connect for each provider with no connection, and runs as usual (owner, 2026-11-26)', async () => {
  const secrets: SecretStore = {read: async () => null, remove: async () => {}};
  const base = defaultSettings();
  files[`${DIR}/settings.json`] = JSON.stringify({
    ...base,
    modules: {...base.modules, calendar: true},
  });
  const tree = await mountApp(<App folder={folder as never} secrets={secrets} />);
  // Calendar is on with no provider connected: Google and iCloud offer Connect; ICS needs none.
  expect(texts(tree)).toEqual(
    expect.arrayContaining(['Google: not connected.', 'iCloud: not connected.']),
  );
  expect(texts(tree)).not.toContain('Todoist: not connected.');
  expect(
    tree.root.findAllByProps({accessibilityLabel: 'Connect Google'}).length,
  ).toBeGreaterThan(0);
  expect(screenBreaks(tree.root)).toEqual([]);
});
