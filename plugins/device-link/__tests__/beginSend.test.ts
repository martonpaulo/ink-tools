/** The tap of Send Page and Send Selection keeps the view open to the list or to Settings (#582). */
import {createWorking} from '@ink-tools/ui-kit';
import {beginSend} from '../src/run';
import {copy} from '../src/copy';
import {pickState, cancelPick} from '../src/send/pickSession';
import type {Device} from '../src/localsend/protocol';

const DEVICE = {alias: 'Mac', fingerprint: 'f'} as unknown as Device;

/** The strip over fake ports that record what the view was told to do. */
function strip() {
  const events: string[] = [];
  const working = createWorking({
    show: async () => {
      events.push('show');
    },
    close: async () => {
      events.push('close');
    },
    toast: () => {},
    log: () => {},
    copy: {failed: 'failed', timeout: 'timeout'},
  });
  return {working, events};
}

afterEach(() => cancelPick({closeView: () => {}}));

test.each(['page', 'selection'] as const)(
  '%s with no receiver leaves the view open, never closing it before Settings shows «No LocalSend device found»',
  async capture => {
    // The same press, four times: the first worked on the tablet, the next three closed alone.
    for (let press = 0; press < 4; press += 1) {
      const {working, events} = strip();
      await beginSend(capture, working, async () => ({kind: 'none'}));
      expect(events).toEqual(['show']);
      expect(working.isWorking()).toBe(false);
    }
    expect(copy.noDevice).toBe('No LocalSend device found');
  },
);

test('receivers found set the list and leave the view open', async () => {
  const {working, events} = strip();
  await beginSend('page', working, async () => ({kind: 'pick', devices: [DEVICE]}));
  expect(events).toEqual(['show']);
  expect(pickState()).toEqual({phase: 'picking', capture: 'page', devices: [DEVICE]});
});

test('a refused permission holds the Needs state on the open view', async () => {
  const {working, events} = strip();
  const problem = {what: 'No access', reason: 'Allow it'};
  await beginSend('page', working, async () => ({kind: 'needs', problem}));
  expect(events).toEqual(['show']);
  expect(working.problem()).toEqual(problem);
  expect(working.heldState()).toBe('needs');
});
