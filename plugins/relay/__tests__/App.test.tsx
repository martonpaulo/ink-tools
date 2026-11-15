/** Relay's Settings view (#98): the shared size rules, the device list and the saved choice. */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@supernote-tools/ui-kit/screenBreaks';
import App, {deviceLabel} from '../App';
import {fakeRelay} from '../test-support/fakeRelay';

const lan = (...parts: number[]) => parts.join('.');
const answer = (alias: string, fingerprint: string) =>
  JSON.stringify({alias, fingerprint, port: 53317, protocol: 'https'});

async function render(api: ReturnType<typeof fakeRelay>['api']) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App native={api} />);
  });
  return tree;
}

test('the Settings view keeps the size rules and has a header', async () => {
  const tree = await render(fakeRelay().api);
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(
    tree.root.findByProps({accessibilityRole: 'header'}).props.children,
  ).toBe('Relay');
  expect(
    tree.root.findAllByProps({children: 'No LocalSend device found'}).length,
  ).toBeGreaterThan(0);
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
