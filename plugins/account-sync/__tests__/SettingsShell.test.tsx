/** Bridge's Settings shell: its states, its header, and the shared size rules (#93). */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {CLOSE_TEXT, RETRY_TEXT} from '@ink-tools/ui-kit';
import {fail, ok, THROWN_CODE} from '@ink-tools/sn-adapter/official';
import {Ask, SettingsShell, ShellState} from '../src/SettingsShell';
import {copy} from '../src/copy';

/** The host dialog cannot be shown in a test: by default every question is drawn in the view. */
const noDialog: Ask = async () => fail(THROWN_CODE, 'no dialog in a test');

function render(state: ShellState, onClose: () => void = () => {}, ask: Ask = noDialog) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SettingsShell state={state} onClose={onClose} ask={ask} />);
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

const STATES: Record<string, ShellState> = {
  loading: {kind: 'loading'},
  error: {kind: 'error', reason: 'storage did not answer', onRetry: () => {}},
  empty: {kind: 'ready', modules: []},
  notice: {kind: 'ready', modules: [], notice: 'The change was not saved: disk full'},
  syncing: {kind: 'ready', modules: [], sync: {running: true, onSyncNow: () => {}}},
  syncProblem: {
    kind: 'ready',
    modules: [],
    sync: {running: false, onSyncNow: () => {}, problem: 'storage did not answer'},
  },
  modules: {
    kind: 'ready',
    modules: [
      {
        id: 'calendar',
        name: 'Calendar',
        status: {
          state: 'ran',
          run: {
            module: 'calendar',
            at: new Date(2026, 10, 14, 14, 5).getTime(),
            counts: {added: 3, changed: 1, removed: 0},
            errors: ['Work: HTTP 500'],
            warnings: [],
          },
        },
      },
      {
        id: 'todo',
        name: 'To-do',
        status: {
          state: 'blocked',
          reasons: ['the To-Do provider did not answer'],
        },
      },
    ],
  },
  offWithRows: {
    kind: 'ready',
    modules: [
      {id: 'calendar', name: 'Calendar', status: {state: 'off'}, onRemoveWritten: () => {}},
    ],
  },
};

describe('SettingsShell (#93)', () => {
  it.each(Object.keys(STATES))('keeps the size rules in the %s state', name => {
    expect(screenBreaks(render(STATES[name]).root)).toEqual([]);
  });

  it('marks the title as a header', () => {
    const title = render(STATES.empty).root.findByProps({
      accessibilityRole: 'header',
    });
    expect(title.props.children).toBe(copy.title);
  });

  it('shows loading, the empty state and the error with its reason', () => {
    expect(texts(render(STATES.loading))).toContain(copy['settings.loading']);
    expect(texts(render(STATES.empty))).toContain(copy['settings.empty']);
    // A save that failed is said in words, as an alert, and the screen stays usable (#40).
    const notice = render(STATES.notice).root.findByProps({accessibilityRole: 'alert'});
    expect(notice.props.children).toBe('The change was not saved: disk full');
  });

  it('shows a failed settings read as the Error state: its reason, Retry and Close (#256)', () => {
    const onRetry = jest.fn();
    const onClose = jest.fn();
    const tree = render({kind: 'error', reason: 'storage did not answer', onRetry}, onClose);
    expect(tree.root.findByProps({testID: 'error-view'})).toBeTruthy();
    expect(texts(tree)).toEqual([copy['settings.error'], 'storage did not answer', RETRY_TEXT]);
    act(() => control(tree, RETRY_TEXT).props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
    act(() => control(tree, CLOSE_TEXT).props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(Object.keys(STATES))('keeps the title bar\'s Close in the %s state (#256)', name => {
    expect(control(render(STATES[name]), CLOSE_TEXT)).toBeDefined();
  });

  it('shows the last sync of each module and why a module that is on does not run (#88)', () => {
    expect(texts(render(STATES.modules))).toEqual([
      copy.title,
      'Calendar',
      'Last synced 2026-11-14 14:05.\n3 added, 1 changed, 0 removed\nNot synced (1):\nWork: HTTP 500',
      'To-do',
      'On, but not running: the To-Do provider did not answer.',
    ]);
  });

  describe('Remove what Bridge wrote (#89)', () => {
    const offModule = (onRemoveWritten: () => void, state: 'off' | 'waiting' = 'off'): ShellState => ({
      kind: 'ready',
      modules: [{id: 'calendar', name: 'Calendar', status: {state}, onRemoveWritten}],
    });
    const press = async (tree: ReactTestRenderer, label: string) =>
      act(async () => tree.root.findByProps({accessibilityLabel: label}).props.onPress());

    it('asks in the host dialog and removes only on its action (#296)', async () => {
      const onRemove = jest.fn();
      const ask = jest.fn(async (_q: string, _a: string, _c: string) => ok(true));
      const tree = render(offModule(onRemove), () => {}, ask);
      await press(tree, copy['remove.button']);
      expect(ask).toHaveBeenCalledWith(
        'Remove what Account Sync wrote for Calendar? Your own events and tasks stay.',
        copy['remove.yes'],
        copy.cancel,
      );
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('removes nothing when the host dialog answers Cancel (#296)', async () => {
      const onRemove = jest.fn();
      const tree = render(offModule(onRemove), () => {}, async () => ok(false));
      await press(tree, copy['remove.button']);
      expect(onRemove).not.toHaveBeenCalled();
      expect(tree.root.findAllByProps({accessibilityLabel: copy['remove.yes']})).toHaveLength(0);
    });

    it('asks in the view when the host dialog fails, and removes only on the second press', async () => {
      const onRemove = jest.fn();
      const tree = render(offModule(onRemove));
      await press(tree, copy['remove.button']);
      expect(onRemove).not.toHaveBeenCalled();
      expect(texts(tree)).toContain(
        'Remove what Account Sync wrote for Calendar? Your own events and tasks stay.',
      );
      expect(screenBreaks(tree.root)).toEqual([]);
      await press(tree, copy['remove.yes']);
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('cancels without removing anything', async () => {
      const onRemove = jest.fn();
      const tree = render(offModule(onRemove));
      await press(tree, copy['remove.button']);
      await press(tree, copy.cancel);
      expect(onRemove).not.toHaveBeenCalled();
      expect(tree.root.findAllByProps({accessibilityLabel: copy['remove.button']})).not.toHaveLength(0);
    });

    it('is not offered while the module is on', () => {
      const tree = render(offModule(() => {}, 'waiting'));
      expect(tree.root.findAllByProps({accessibilityLabel: copy['remove.button']})).toHaveLength(0);
    });
  });

  describe('Sign-in per provider (#90)', () => {
    const withSignIns = (onSignOut: () => void): ShellState => ({
      kind: 'ready',
      modules: [
        {
          id: 'todo',
          name: 'To-do',
          status: {state: 'waiting'},
          signIns: [
            {id: 'todoist', name: 'Todoist', signIn: {state: 'signedIn', tail: '…wxyz'}, onSignOut},
            {id: 'icloud', name: 'iCloud', signIn: {state: 'signedOut'}, onSignOut: () => {}},
            {id: 'google', name: 'Google', signIn: {state: 'unreadable', reason: 'read failed'}, onSignOut: () => {}},
          ],
        },
      ],
    });
    const press = async (tree: ReactTestRenderer, label: string) =>
      act(async () =>
        tree.root
          .findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]
          .props.onPress(),
      );

    it('shows only the masked tail, how to sign in, and an unreadable sign-in apart', () => {
      const tree = render(withSignIns(() => {}));
      expect(texts(tree)).toEqual(
        expect.arrayContaining([
          'Todoist: signed in (…wxyz).',
          'iCloud: not connected.',
          'Google: the sign-in did not read: read failed',
        ]),
      );
      expect(screenBreaks(tree.root)).toEqual([]);
      expect(tree.root.findAllByProps({accessibilityLabel: 'Sign out of iCloud'})).toHaveLength(0);
    });

    it('offers Connect for a provider with no connection, which opens the Needs state with its steps (owner, 2026-11-26; #256)', async () => {
      const onClose = jest.fn();
      const tree = render(withSignIns(() => {}), onClose);
      expect(tree.root.findAllByProps({accessibilityLabel: 'Connect Todoist'})).toHaveLength(0);
      await press(tree, 'Connect iCloud');
      expect(tree.root.findByProps({testID: 'needs'})).toBeTruthy();
      expect(texts(tree)).toEqual([
        'iCloud is not connected',
        'Account Sync reads iCloud with your own sign-in, which comes from the Mac.',
        '1. On the Mac, run inkctl secret set icloud.',
        '2. Close this view and press Sync now.',
      ]);
      expect(screenBreaks(tree.root)).toEqual([]);
      // Its × goes back to Settings, never closes the plugin.
      await press(tree, CLOSE_TEXT);
      expect(onClose).not.toHaveBeenCalled();
      expect(texts(tree)).toContain('iCloud: not connected.');
    });

    it('signs out only after the confirmation, and Cancel keeps the sign-in', async () => {
      const onSignOut = jest.fn();
      const tree = render(withSignIns(onSignOut));
      await press(tree, 'Sign out of Todoist');
      await press(tree, copy.cancel);
      expect(onSignOut).not.toHaveBeenCalled();
      await press(tree, 'Sign out of Todoist');
      expect(texts(tree)).toContain('Sign out of Todoist? Account Sync deletes its sign-in from the tablet.');
      await press(tree, copy['signOut.yes']);
      expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('signs out from the host dialog, which asks the same question (#296)', async () => {
      const onSignOut = jest.fn();
      const ask = jest.fn(async (_q: string, _a: string, _c: string) => ok(true));
      const tree = render(withSignIns(onSignOut), () => {}, ask);
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

describe('the Sync now button (#40)', () => {
  const button = (tree: ReactTestRenderer) =>
    tree.root.findByProps({accessibilityLabel: copy['sync.button']});

  test('a press starts a pass', () => {
    const onSyncNow = jest.fn();
    const tree = render({kind: 'ready', modules: [], sync: {running: false, onSyncNow}});
    act(() => button(tree).props.onPress());
    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  test('it is disabled, in words, while a pass runs', () => {
    const tree = render(STATES.syncing);
    expect(button(tree).props.accessibilityState).toMatchObject({disabled: true});
    expect(texts(tree)).toContain(copy['sync.running']);
  });

  test('a pass that did not start says why', () => {
    expect(texts(render(STATES.syncProblem))).toContain(
      'The sync did not start: storage did not answer',
    );
  });
});
