/**
 * Bridge's Settings: its states, its title bar with «Sync now», each module as one group with its
 * status line, its accounts as rows with their action, and the shared size rules (#93, #411).
 */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {CLOSE_TEXT, RETRY_TEXT} from '@ink-tools/ui-kit';
import {BridgeSettings, defaultSettings, setModule, setProvider} from '@ink-tools/sync-core/settings';
import {fail, ok, THROWN_CODE} from '@ink-tools/sn-adapter/official';
import {Ask, ModuleRow, SettingsShell, ShellState} from '../src/SettingsShell';
import {SettingsForm} from '../src/SettingsForm';
import {copy} from '../src/copy';

const AT = new Date(2026, 10, 14, 14, 5).getTime();
/** The host dialog cannot be shown in a test: by default every question is drawn in the view. */
const noDialog: Ask = async () => fail(THROWN_CODE, 'no dialog in a test');

function render(
  state: ShellState,
  onClose: () => void = () => {},
  modules?: ModuleRow[],
  settings: BridgeSettings = defaultSettings(),
  ask: Ask = noDialog,
) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SettingsShell
        state={state}
        onClose={onClose}
        renderForm={
          modules &&
          (onConnect => (
            <SettingsForm settings={settings} onChange={() => {}} modules={modules} onConnect={onConnect} now={AT} ask={ask} />
          ))
        }
      />,
    );
  });
  return tree;
}
/** The outermost node with that spoken name or label that acts: a Button, or the title bar's ×. */
const control = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    n => (n.props.accessibilityLabel ?? n.props.label) === label && typeof n.props.onPress === 'function',
  )[0];
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => node.props.children);
const press = async (tree: ReactTestRenderer, label: string) =>
  act(async () => control(tree, label).props.onPress());

const READY: ShellState = {kind: 'ready'};
const STATES: Record<string, ShellState> = {
  loading: {kind: 'loading'},
  error: {kind: 'error', reason: 'storage did not answer', onRetry: () => {}},
  ready: READY,
  notice: {kind: 'ready', notice: 'The change was not saved: disk full'},
  syncing: {kind: 'ready', sync: {running: true, onSyncNow: () => {}}},
  syncProblem: {kind: 'ready', sync: {running: false, onSyncNow: () => {}, problem: 'storage did not answer'}},
};

const ON = setModule(setModule(defaultSettings(), 'calendar', true), 'todo', true);
const MODULES: ModuleRow[] = [
  {
    id: 'calendar',
    name: 'Calendar',
    status: {
      state: 'ran',
      run: {module: 'calendar', at: AT, counts: {added: 3, changed: 1, removed: 0}, errors: ['Work: HTTP 500'], warnings: []},
    },
  },
  {id: 'todo', name: 'To-Do', status: {state: 'blocked', reasons: ['the To-Do provider did not answer']}},
  {id: 'digest', name: 'Digest', status: {state: 'off'}},
];

describe('SettingsShell (#93)', () => {
  it.each(Object.keys(STATES))('keeps the size rules in the %s state', name => {
    expect(screenBreaks(render(STATES[name], () => {}, MODULES, ON).root)).toEqual([]);
  });

  it('marks the title as a header', () => {
    const title = render(READY).root.findByProps({accessibilityRole: 'header'});
    expect(title.props.children).toBe(copy.title);
  });

  it('shows loading and a save that failed, as an alert, with the screen still usable (#40)', () => {
    expect(texts(render(STATES.loading))).toContain(copy['settings.loading']);
    const notice = render(STATES.notice).root.findByProps({accessibilityRole: 'alert'});
    expect(notice.props.children).toBe('The change was not saved: disk full');
  });

  it('shows a failed settings read as the Error state: its reason, Retry and Close (#256)', async () => {
    const onRetry = jest.fn();
    const onClose = jest.fn();
    const tree = render({kind: 'error', reason: 'storage did not answer', onRetry}, onClose);
    expect(tree.root.findByProps({testID: 'error-view'})).toBeTruthy();
    expect(texts(tree)).toEqual([copy['settings.error'], 'storage did not answer', RETRY_TEXT]);
    await press(tree, RETRY_TEXT);
    expect(onRetry).toHaveBeenCalledTimes(1);
    await press(tree, CLOSE_TEXT);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(Object.keys(STATES))("keeps the title bar's Close in the %s state (#256)", name => {
    expect(control(render(STATES[name]), CLOSE_TEXT)).toBeDefined();
  });

  it('gives each module one status line under its switch, and says what an off module does (#88, #411)', () => {
    const shown = texts(render(READY, () => {}, MODULES, ON));
    expect(shown).toEqual(
      expect.arrayContaining([
        'Synced at 14:05 · 3 events added, 1 event changed, some events not synced',
        'On, but not running: the To-Do provider did not answer.',
        copy['about.digest'],
      ]),
    );
    expect(shown.join('\n')).not.toMatch(/HTTP 500|Off\.|0 removed/);
  });

  describe('Remove what Bridge wrote (#89)', () => {
    const offModule = (onRemoveWritten: () => void): ModuleRow[] => [
      {id: 'calendar', name: 'Calendar', status: {state: 'off'}, onRemoveWritten},
    ];

    it('asks in its row when the host dialog fails, and removes only on the second press', async () => {
      const onRemove = jest.fn();
      const tree = render(READY, () => {}, offModule(onRemove));
      await press(tree, copy['remove.yes']);
      expect(onRemove).not.toHaveBeenCalled();
      expect(texts(tree)).toContain('Remove what Account Sync wrote for Calendar? Your own events and tasks stay.');
      expect(screenBreaks(tree.root)).toEqual([]);
      await press(tree, copy['remove.yes']);
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('cancels without removing anything', async () => {
      const onRemove = jest.fn();
      const tree = render(READY, () => {}, offModule(onRemove));
      await press(tree, copy['remove.yes']);
      await press(tree, copy.cancel);
      expect(onRemove).not.toHaveBeenCalled();
      expect(texts(tree)).toContain(copy['remove.about']);
    });

    it('asks in the host dialog and removes only on its action (#296)', async () => {
      const onRemove = jest.fn();
      const ask = jest.fn(async (_q: string, _a: string, _c: string) => ok(true));
      const tree = render(READY, () => {}, offModule(onRemove), defaultSettings(), ask);
      await press(tree, copy['remove.yes']);
      expect(ask).toHaveBeenCalledWith(
        'Remove what Account Sync wrote for Calendar? Your own events and tasks stay.',
        copy['remove.yes'],
        copy.cancel,
      );
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('removes nothing when the host dialog answers Cancel (#296)', async () => {
      const onRemove = jest.fn();
      const tree = render(READY, () => {}, offModule(onRemove), defaultSettings(), async () => ok(false));
      await press(tree, copy['remove.yes']);
      expect(onRemove).not.toHaveBeenCalled();
      expect(texts(tree)).toContain(copy['remove.about']);
    });

    it('stays pressable after Back closed the host dialog with no answer (#296)', async () => {
      const onRemove = jest.fn();
      // Back: the first question never settles; the next press asks again and is answered.
      const answers = [new Promise<never>(() => {}), Promise.resolve(ok(true))];
      const ask = jest.fn((_q: string, _a: string, _c: string) => answers.shift()!);
      const tree = render(READY, () => {}, offModule(onRemove), defaultSettings(), ask);
      act(() => {
        control(tree, copy['remove.yes']).props.onPress();
      });
      expect(control(tree, copy['remove.yes']).props.disabled).toBeFalsy();
      await press(tree, copy['remove.yes']);
      expect(ask).toHaveBeenCalledTimes(2);
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('is not offered while the module is on', () => {
      const tree = render(READY, () => {}, [{...offModule(() => {})[0], status: {state: 'waiting'}}], ON);
      expect(texts(tree)).not.toContain(copy['remove.title']);
    });
  });

  describe('each account as one row with its action (#90, #411)', () => {
    const settings = setProvider(setProvider(setProvider(ON, 'todoist', true), 'icloud', true), 'google', true);
    const withSignIns = (onSignOut: () => void): ModuleRow[] => [
      {
        id: 'calendar',
        name: 'Calendar',
        status: {state: 'waiting'},
        signIns: [
          {id: 'icloud', name: 'iCloud', signIn: {state: 'signedOut'}, onSignOut: () => {}},
          {id: 'google', name: 'Google', signIn: {state: 'unreadable', reason: 'read failed'}, onSignOut: () => {}},
        ],
      },
      {
        id: 'todo',
        name: 'To-Do',
        status: {state: 'waiting'},
        signIns: [{id: 'todoist', name: 'Todoist', signIn: {state: 'signedIn', account: 'tester@example.com'}, onSignOut}],
      },
    ];

    it('names the connected account, how to sign in, and an unreadable sign-in apart (#433)', () => {
      const tree = render(READY, () => {}, withSignIns(() => {}), settings);
      expect(texts(tree)).toEqual(
        expect.arrayContaining([
          'Todoist account',
          'Connected as tester@example.com',
          'iCloud account',
          'Not connected',
          'The sign-in did not read: read failed',
        ]),
      );
      expect(screenBreaks(tree.root)).toEqual([]);
      expect(tree.root.findAllByProps({accessibilityLabel: 'Sign out of iCloud'})).toHaveLength(0);
    });

    it('offers Connect for a provider with no connection, which opens its form typed on the tablet (#487)', async () => {
      const onClose = jest.fn();
      const saved: string[] = [];
      const rows = withSignIns(() => {});
      rows[0].signIns![0] = {
        ...rows[0].signIns![0],
        onConnect: async secret => {
          saved.push(secret);
        },
      };
      const tree = render(READY, onClose, rows, settings);
      expect(tree.root.findAllByProps({accessibilityLabel: 'Connect Todoist'})).toHaveLength(0);
      await press(tree, 'Connect iCloud');
      expect(texts(tree)).toEqual(
        expect.arrayContaining(['Connect iCloud', 'Apple ID', 'App-specific password', copy['connect.icloud.about']]),
      );
      expect(screenBreaks(tree.root)).toEqual([]);
      const type = (label: string, text: string) =>
        act(() => tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function').props.onChangeText(text));
      type('Apple ID', 'tester@example.com');
      type('App-specific password', 'abcd-efgh-ijkl-mnop');
      await press(tree, 'Connect iCloud');
      expect(saved).toEqual(['tester@example.com:abcd-efgh-ijkl-mnop']);
      // Saved, the form goes back to Settings, never closes the plugin.
      expect(onClose).not.toHaveBeenCalled();
      expect(texts(tree)).toContain('iCloud account');
    });

    it('keeps the typed values and says why when the save fails (#487)', async () => {
      const rows = withSignIns(() => {});
      rows[0].signIns![0] = {
        ...rows[0].signIns![0],
        onConnect: async () => {
          throw new Error('disk full');
        },
      };
      const tree = render(READY, () => {}, rows, settings);
      await press(tree, 'Connect iCloud');
      act(() => tree.root.find(n => n.props.accessibilityLabel === 'Apple ID' && typeof n.props.onChangeText === 'function').props.onChangeText('a:b@example.com'));
      act(() => tree.root.find(n => n.props.accessibilityLabel === 'App-specific password' && typeof n.props.onChangeText === 'function').props.onChangeText('pw'));
      await press(tree, 'Connect iCloud');
      expect(texts(tree)).toContain(copy['connect.icloud.colon']);
      act(() => tree.root.find(n => n.props.accessibilityLabel === 'Apple ID' && typeof n.props.onChangeText === 'function').props.onChangeText('tester@example.com'));
      await press(tree, 'Connect iCloud');
      expect(texts(tree)).toContain('The iCloud sign-in was not saved: disk full');
      expect(tree.root.find(n => n.props.accessibilityLabel === 'Apple ID' && typeof n.props.onChangeText === 'function').props.value).toBe('tester@example.com');
    });

    it('shows Google as not connectable on the tablet yet, with the reason and no step (#245, #487)', async () => {
      const rows = withSignIns(() => {});
      rows[0].signIns![1] = {id: 'google', name: 'Google', signIn: {state: 'signedOut'}, onSignOut: () => {}, onConnect: async () => {}};
      const tree = render(READY, () => {}, rows, settings);
      await press(tree, 'Connect Google');
      expect(tree.root.findByProps({testID: 'needs'})).toBeTruthy();
      expect(texts(tree)).toEqual(['Google is not connected', copy['connect.google.unavailable']]);
      expect(screenBreaks(tree.root)).toEqual([]);
      await press(tree, CLOSE_TEXT);
      expect(texts(tree)).toContain('iCloud account');
    });

    it('signs out only after the confirmation, and Cancel keeps the sign-in', async () => {
      const onSignOut = jest.fn();
      const tree = render(READY, () => {}, withSignIns(onSignOut), settings);
      await press(tree, 'Sign out of Todoist');
      await press(tree, copy.cancel);
      expect(onSignOut).not.toHaveBeenCalled();
      await press(tree, 'Sign out of Todoist');
      expect(texts(tree)).toContain('Sign out of Todoist? Account Sync deletes its sign-in from the tablet.');
      await press(tree, copy['signOut.yes']);
      expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('asks before it signs out an unreadable sign-in too (#296)', async () => {
      const onSignOut = jest.fn();
      const ask = jest.fn(async (_q: string, _a: string, _c: string) => ok(false));
      const rows = withSignIns(() => {});
      rows[0].signIns![1] = {...rows[0].signIns![1], onSignOut};
      const tree = render(READY, () => {}, rows, settings, ask);
      await press(tree, 'Sign out of Google');
      expect(ask).toHaveBeenCalledWith('Sign out of Google? Account Sync deletes its sign-in from the tablet.', copy['signOut.yes'], copy.cancel);
      expect(onSignOut).not.toHaveBeenCalled();
    });

    it('signs out from the host dialog, which asks the same question (#296)', async () => {
      const onSignOut = jest.fn();
      const ask = jest.fn(async (_q: string, _a: string, _c: string) => ok(true));
      const tree = render(READY, () => {}, withSignIns(onSignOut), settings, ask);
      await press(tree, 'Sign out of Todoist');
      expect(ask).toHaveBeenCalledWith(
        'Sign out of Todoist? Account Sync deletes its sign-in from the tablet.',
        copy['signOut.yes'],
        copy.cancel,
      );
      expect(onSignOut).toHaveBeenCalledTimes(1);
    });
  });
});

describe('«Sync now», the title bar action (#40, #411)', () => {
  test('a press starts a pass', async () => {
    const onSyncNow = jest.fn();
    const tree = render({kind: 'ready', sync: {running: false, onSyncNow}});
    await press(tree, copy['sync.button']);
    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  test('while a pass runs it says so and takes no press', () => {
    const tree = render(STATES.syncing);
    expect(texts(tree)).toContain(copy['sync.running']);
    expect(control(tree, copy['sync.button'])).toBeUndefined();
  });

  test('a pass that did not start says why', () => {
    expect(texts(render(STATES.syncProblem))).toContain('The sync did not start: storage did not answer');
  });
});
