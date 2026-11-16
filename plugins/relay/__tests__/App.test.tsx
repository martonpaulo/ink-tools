/** Relay's Settings view (#98): the shared size rules, the device list and the saved choice. */
import React from 'react';
import {BackHandler} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import App, {deviceLabel, ReceiveView, TextView} from '../App';
import {ownFingerprint} from '../src/settings/device';
import {fail, ok} from '@supernote-tools/sn-adapter/official';
import {fakeRelay} from '../test-support/fakeRelay';
import {Device} from '../src/localsend/protocol';

const lan = (...parts: number[]) => parts.join('.');
const answer = (alias: string, fingerprint: string) =>
  JSON.stringify({alias, fingerprint, port: 53317, protocol: 'https'});

async function render(
  api: ReturnType<typeof fakeRelay>['api'],
  close: () => void = () => {},
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App native={api} close={close} />);
  });
  return tree;
}

test('the Settings view keeps the size rules and has a header', async () => {
  const tree = await render(fakeRelay().api);
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(
    tree.root.findByProps({accessibilityRole: 'header'}).props.children,
  ).toBe('Device Transfer');
  expect(
    tree.root.findAllByProps({children: 'No LocalSend device found'}).length,
  ).toBeGreaterThan(0);
});

test('«No LocalSend device found» closes by its Close button and by Back (#98)', async () => {
  const handlers: (() => boolean | null | undefined)[] = [];
  const listen = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      handlers.push(handler);
      return {remove: () => {}};
    });
  const close = jest.fn();
  const tree = await render(fakeRelay().api, close);
  expect(
    tree.root.findAllByProps({children: 'No LocalSend device found'}).length,
  ).toBeGreaterThan(0);
  await act(async () => {
    tree.root.findByProps({label: 'Close'}).props.onPress();
  });
  expect(close).toHaveBeenCalledTimes(1);
  expect(handlers.length).toBeGreaterThan(0);
  await act(async () => {
    expect(handlers[handlers.length - 1]()).toBe(true);
  });
  expect(close).toHaveBeenCalledTimes(2);
  listen.mockRestore();
});

test('picking a found device saves it with its fingerprint', async () => {
  const {api, calls} = fakeRelay({
    discover: jest.fn(async () => [
      {ip: lan(10, 0, 0, 2), text: answer('Mac', 'fp')},
    ]),
  });
  const tree = await render(api);
  await act(async () => {
    tree.root.findByProps({label: 'Mac'}).props.onPress();
  });
  expect(JSON.parse(calls.written[0]).device).toMatchObject({
    alias: 'Mac',
    fingerprint: 'fp',
  });
  expect(tree.root.findByProps({label: 'Mac'}).props.selected).toBe(true);
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
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ReceiveView state="ready" onStop={onStop} />);
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
});

test('the send half announces the certificate fingerprint, the saved one only without it', async () => {
  const settings = {fingerprint: 'saved', device: null};
  const {api} = fakeRelay();
  await expect(
    ownFingerprint(api, settings, async () => ok('/p')),
  ).resolves.toBe('cert-fp');
  await expect(
    ownFingerprint(api, settings, async () => fail(-1, 'no dir')),
  ).resolves.toBe('saved');
});

test('«Send Text» shows the text with Send and Cancel, or only Close when empty (#99)', async () => {
  const device: Device = {
    alias: 'Mac',
    ip: lan(10, 0, 0, 2),
    port: 53317,
    protocol: 'https',
    fingerprint: 'fp',
  };
  const onSend = jest.fn();
  let ready!: ReactTestRenderer;
  await act(async () => {
    ready = renderer.create(
      <TextView
        state={{phase: 'ready', text: 'Buy milk', device}}
        onSend={onSend}
        onCancel={() => {}}
      />,
    );
  });
  expect(screenBreaks(ready.root)).toEqual([]);
  await act(async () => {
    ready.root.findByProps({label: 'Send to Mac'}).props.onPress();
  });
  expect(onSend).toHaveBeenCalledTimes(1);
  expect(ready.root.findAllByProps({label: 'Cancel'}).length).toBeGreaterThan(
    0,
  );
  let empty!: ReactTestRenderer;
  await act(async () => {
    empty = renderer.create(
      <TextView state={{phase: 'empty'}} onSend={onSend} onCancel={() => {}} />,
    );
  });
  expect(empty.root.findAllByProps({label: 'Close'}).length).toBeGreaterThan(0);
  expect(empty.root.findAllByProps({label: 'Send to Mac'})).toEqual([]);
});
