/** Plugin Diagnostics' view on ui-kit (#257): Close on every screen, a failed probe as Error, a missing piece as Needs. */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import App from '../App';
import type {ProbeOutcome} from '../src/probe';
import {copy} from '../src/copy';

const mount = async (outcome: ProbeOutcome, close = jest.fn()) => {
  const run = jest.fn(async () => outcome);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App close={close} run={run} />);
  });
  return {tree, run, close};
};

const control = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(node => typeof node.type === 'string' && typeof node.props.children === 'string')
    .map(node => node.props.children as string);
const press = async (tree: ReactTestRenderer, label: string) => {
  await act(async () => {
    control(tree, label).props.onPress();
  });
};

test('the probe view keeps the size rules, has the title bar with Close, and never runs on mount', async () => {
  const {tree, run, close} = await mount({lines: ['probe done'], status: 'done'});
  expect(screenBreaks(tree.root)).toEqual([]);
  expect(tree.root.findAllByProps({accessibilityRole: 'header'})[0].props.children).toBe('Plugin Diagnostics');
  expect(run).not.toHaveBeenCalled();
  await press(tree, 'Close');
  expect(close).toHaveBeenCalledTimes(1);
});

test('a probe that ends shows its lines under «Run Probe», with Close', async () => {
  const {tree} = await mount({lines: ['runtime keys: a', 'probe done'], status: 'done'});
  await press(tree, 'Run Probe');
  expect(texts(tree)).toEqual(expect.arrayContaining(['runtime keys: a', 'probe done']));
  expect(control(tree, 'Close')).toBeDefined();
});

test('a failed probe shows the Error state with its reason, Retry and Close', async () => {
  const {tree, run, close} = await mount({lines: ['probe failed: digest query DENIED'], status: 'failed', reason: 'digest query DENIED'});
  await press(tree, 'Run Probe');
  expect(tree.root.findByProps({testID: 'error-view'})).toBeDefined();
  expect(texts(tree)).toEqual(expect.arrayContaining(['The probe failed', 'digest query DENIED']));
  expect(screenBreaks(tree.root)).toEqual([]);
  await press(tree, 'Retry');
  expect(run).toHaveBeenCalledTimes(2);
  await press(tree, 'Close');
  expect(close).toHaveBeenCalledTimes(1);
});

test('a probe that found the native module missing shows the Needs state with its fix and Close', async () => {
  const need = copy['needs.native'];
  const {tree, close} = await mount({lines: [], status: 'needs', need});
  await press(tree, 'Run Probe');
  expect(tree.root.findByProps({testID: 'needs'})).toBeDefined();
  expect(texts(tree)).toEqual(expect.arrayContaining([need.what, need.reason, `1. ${need.steps[0]}`, `2. ${need.steps[1]}`]));
  expect(screenBreaks(tree.root)).toEqual([]);
  await press(tree, 'Close');
  expect(close).toHaveBeenCalledTimes(1);
});

test('Back closes the view as Close does (#204)', async () => {
  const back = catchBackKey();
  const {close} = await mount({lines: [], status: 'done'});
  expect(back.press()).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
  back.restore();
});
