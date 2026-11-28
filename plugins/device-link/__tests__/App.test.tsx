/** Relay's Settings view (#98): the shared size rules, the device list and the saved choice. */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import App, {deviceLabel, ReceiveView, TextView} from '../App';
import {ownFingerprint} from '../src/settings/device';
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {fakeRelay} from '../test-support/fakeRelay';
import {Device} from '../src/localsend/protocol';
import {receivingInBackground, runReceive} from '../src/receive/session';

const lan = (...parts: number[]) => parts.join('.');
const answer = (alias: string, fingerprint: string) =>
  JSON.stringify({alias, fingerprint, port: 53317, protocol: 'https'});

/** The pressable list rows named `label` (#307). */
const rows = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    node =>
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityLabel === label,
  );
const row = (tree: ReactTestRenderer, label: string) => rows(tree, label)[0];

async function render(
  api: ReturnType<typeof fakeRelay>['api'],
  close: () => void = () => {},
  armBackKey: (rootTag: number) => void = () => {},
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <App native={api} close={close} armBackKey={armBackKey} />,
    );
  });
  return tree;
}

test('the Settings view keeps the size rules and has a header', async () => {
  const tree = await render(fakeRelay().api);
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(
    tree.root.findByProps({accessibilityRole: 'header'}).props.children,
  ).toBe('Device Link');
  expect(
    tree.root.findAllByProps({children: 'No LocalSend device found'}).length,
  ).toBeGreaterThan(0);
});

test('«No LocalSend device found» closes by its Close button and by Back (#98)', async () => {
  const back = catchBackKey();
  const close = jest.fn();
  const tree = await render(fakeRelay().api, close);
  expect(
    tree.root.findAllByProps({children: 'No LocalSend device found'}).length,
  ).toBeGreaterThan(0);
  await act(async () => {
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === 'Close' &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
  expect(close).toHaveBeenCalledTimes(1);
  await act(async () => {
    expect(back.press()).toBe(true);
  });
  expect(close).toHaveBeenCalledTimes(2);
  back.restore();
});

test('picking a found device in Settings lists it first on each send (#307)', async () => {
  const {api, calls} = fakeRelay({
    discover: jest.fn(async () => [
      {ip: lan(10, 0, 0, 2), text: answer('Mac', 'fp')},
    ]),
  });
  const tree = await render(api);
  const radio = () =>
    tree.root.find(
      node =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'Show first when sending: Mac',
    );
  expect(radio().props.accessibilityState.checked).toBe(false);
  await act(async () => {
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === 'Show first when sending: Mac' &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
  expect(JSON.parse(calls.written[0]).last).toMatchObject({
    alias: 'Mac',
    fingerprint: 'fp',
  });
  expect(radio().props.accessibilityState.checked).toBe(true);
  expect(
    tree.root.findAllByProps({children: 'Mac shows first when you send'}).length,
  ).toBeGreaterThan(0);
});

test('two receivers with one alias show apart as two radios (#274)', async () => {
  const {api} = fakeRelay({
    discover: jest.fn(async () => [
      {ip: lan(10, 0, 0, 2), text: answer('Mac', 'a')},
      {ip: lan(10, 0, 0, 3), text: answer('Mac', 'b')},
    ]),
  });
  const tree = await render(api);
  const radios = tree.root.findAll(
    node =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
  );
  expect(radios.map(node => node.props.accessibilityLabel)).toEqual([
    `Show first when sending: Mac · ${lan(10, 0, 0, 2)}`,
    `Show first when sending: Mac · ${lan(10, 0, 0, 3)}`,
  ]);
  expect(screenBreaks(tree.root)).toEqual([]);
});

test('two receivers with one alias are told apart', () => {
  const one = {
    alias: 'Mac',
    ip: lan(10, 0, 0, 2),
    port: 1,
    protocol: 'https' as const,
    fingerprint: 'a',
  };
  const two = {...one, ip: lan(10, 0, 0, 3), fingerprint: 'b'};
  expect(deviceLabel(one, [one, two])).toBe(`Mac · ${one.ip}`);
  expect(deviceLabel(one, [one])).toBe('Mac');
});

test('the receive view keeps the size rules, names the tablet and stops (#49)', async () => {
  const onStop = jest.fn();
  const onClose = jest.fn();
  const view = <ReceiveView state="ready" onStop={onStop} onClose={onClose} />;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(view);
  });
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(
    tree.root.findAllByProps({children: 'Ready to receive as Supernote'})
      .length,
  ).toBeGreaterThan(0);
  await act(async () => {
    tree.root.findByProps({label: 'Stop'}).props.onPress();
  });
  expect(onStop).toHaveBeenCalledTimes(1);
  // Round 9 (Manta, 2026-11-26): the × stopped the receiver, and the next send met «connection
  // refused». The × now only closes the view; the receiver goes on (#289).
  await act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Close'}).props.onPress();
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onStop).toHaveBeenCalledTimes(1);
});

test('the view arms the shared Back key module once, so Back never reaches the note (#300)', async () => {
  // Device round 9 (Manta, 2026-11-26): Back on Device Link's view closed the note under it.
  const arm = jest.fn();
  const tree = await render(fakeRelay().api, () => {}, arm);
  await act(async () => tree.update(<App native={fakeRelay().api} close={() => {}} armBackKey={arm} />));
  expect(arm).toHaveBeenCalledTimes(1);
});

test('Back on a running receive closes only the view; the receiver goes on (#289)', async () => {
  const back = catchBackKey();
  let release!: () => void;
  const {api, calls} = fakeRelay({
    nextReceived: jest.fn(
      () => new Promise(resolve => (release = () => resolve({kind: 'stopped'}))),
    ),
  });
  const host = {
    permissions: async () => null,
    canDelete: async () => true,
    pluginDir: async () => ok('/plugin'),
  } as never;
  const running = runReceive(api, host, 'Supernote', () => {});
  const close = jest.fn();
  const tree = await render(api, close);
  await act(async () => {});
  expect(tree.root.findByProps({label: 'Stop'})).toBeTruthy();
  await act(async () => {
    expect(back.press()).toBe(true);
  });
  expect(close).toHaveBeenCalledTimes(1);
  expect(calls.stopped).toBe(0);
  release();
  await running;
  back.restore();
});

test('Send Text keeps the title bar\'s Close while it waits, never while it reads or sends (#256)', async () => {
  const onCancel = jest.fn();
  const mac = {alias: 'Mac', ip: '10.0.0.2', port: 53317, fingerprint: 'mac', protocol: 'https'} as never;
  const closeOf = (tree: ReactTestRenderer) =>
    tree.root.findAll(n => n.props.accessibilityLabel === 'Close' && typeof n.props.onPress === 'function');
  type State = React.ComponentProps<typeof TextView>['state'];
  const waiting: State[] = [{phase: 'ready', text: 'Buy milk', devices: [mac]}, {phase: 'empty'}];
  for (const state of waiting) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<TextView state={state} onSend={() => {}} onCancel={onCancel} />);
    });
    await act(async () => closeOf(tree)[0].props.onPress());
  }
  expect(onCancel).toHaveBeenCalledTimes(2);
  const working: State[] = [{phase: 'reading'}, {phase: 'sending', text: 'Buy milk', devices: [mac], to: mac}];
  for (const state of working) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<TextView state={state} onSend={() => {}} onCancel={onCancel} />);
    });
    expect(closeOf(tree)).toEqual([]);
  }
});

test('the send half announces the certificate fingerprint, the saved one only without it', async () => {
  const settings = {fingerprint: 'saved', pins: {}, last: null, background: false, deleteRefused: false};
  const {api} = fakeRelay();
  await expect(
    ownFingerprint(api, settings, async () => ok('/p')),
  ).resolves.toBe('cert-fp');
  await expect(
    ownFingerprint(api, settings, async () => fail(-1, 'no dir')),
  ).resolves.toBe('saved');
});

test('«Send Text» shows the text with one row per receiver and Cancel, or only Close when empty (#99, #307)', async () => {
  const device: Device = {
    alias: 'Mac',
    ip: lan(10, 0, 0, 2),
    port: 53317,
    protocol: 'https',
    fingerprint: 'fp',
  };
  const iphone: Device = {...device, alias: 'iPhone', fingerprint: 'fp2'};
  const onSend = jest.fn();
  let ready!: ReactTestRenderer;
  await act(async () => {
    ready = renderer.create(
      <TextView
        state={{phase: 'ready', text: 'Buy milk', devices: [device, iphone]}}
        onSend={onSend}
        onCancel={() => {}}
      />,
    );
  });
  expect(screenBreaks(ready.root)).toEqual([]);
  await act(async () => {
    row(ready, 'iPhone').props.onPress();
  });
  expect(onSend).toHaveBeenCalledTimes(1);
  expect(onSend).toHaveBeenCalledWith(iphone);
  expect(ready.root.findAllByProps({label: 'Cancel'}).length).toBeGreaterThan(
    0,
  );
  let empty!: ReactTestRenderer;
  await act(async () => {
    empty = renderer.create(
      <TextView state={{phase: 'empty'}} onSend={onSend} onCancel={() => {}} />,
    );
  });
  // The empty view's one way out is the title bar's × (#256).
  expect(empty.root.findAllByProps({accessibilityLabel: 'Close'}).length).toBeGreaterThan(0);
  expect(rows(empty, 'Mac')).toEqual([]);
});

const BACKGROUND = 'Receive in the background';
const backgroundOn = (tree: ReactTestRenderer) => row(tree, BACKGROUND).props.accessibilityState.checked;

/** Presses the switch, then lets the save and the receiver's start or end settle, `turns` times. */
async function pressBackground(tree: ReactTestRenderer, turns = 1) {
  await act(async () => {
    row(tree, BACKGROUND).props.onPress();
  });
  for (let i = 0; i < turns; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

test('Settings has «Receive in the background», off by default, and turning it on saves it (#289)', async () => {
  const {api, calls} = fakeRelay();
  const tree = await render(api);
  const toggle = row(tree, 'Receive in the background');
  expect(toggle.props.accessibilityState.checked).toBe(false);
  expect(screenBreaks(tree.root)).toEqual([]);
  await act(async () => {
    toggle.props.onPress();
  });
  expect(backgroundOn(tree)).toBe(true);
  expect(calls.written.some(text => JSON.parse(text).background === true)).toBe(true);
  // Off again, so no receiver outlives the test.
  await pressBackground(tree);
  expect(receivingInBackground()).toBe(false);
});

test('Settings shows the switch off again when the background receiver it started cannot run (#289)', async () => {
  // Files kept in memory, so the switch saved on is read back when the receiver starts.
  const files: Record<string, string> = {};
  const {api} = fakeRelay({
    readText: jest.fn(async (path: string) => files[path] ?? null),
    writeText: jest.fn(async (path: string, text: string) => {
      files[path] = text;
      return null;
    }),
    startReceive: jest.fn(async () => {
      throw Object.assign(new Error('BindException'), {code: 'IO'});
    }),
  });
  const tree = await render(api);
  await pressBackground(tree, 20);
  expect(backgroundOn(tree)).toBe(false);
});

test('Settings puts the switch back when its value cannot be saved (#289)', async () => {
  const {api} = fakeRelay({writeText: jest.fn(async () => {
    throw Object.assign(new Error('EACCES'), {code: 'IO'});
  })});
  const tree = await render(api);
  await pressBackground(tree);
  expect(backgroundOn(tree)).toBe(false);
});
