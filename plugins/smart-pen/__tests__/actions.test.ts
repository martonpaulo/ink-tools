/**
 * Smart Pen's pen recorder and replay by command (#298): `record-pen` and `replay-pen` through
 * sn-adapter's action channel, with the tape refused before anything runs when it is bad.
 */
import {ActionRefused, PEN_TAPE_VERSION, type PenTape} from '@ink-tools/sn-adapter/official';
import {ACTION_PATH, penActions, readActionFile, type PenActionsHost} from '../src/actions';

const TAPE: PenTape = {
  version: PEN_TAPE_VERSION,
  events: [{at: 0, penUp: [{points: [{x: 1, y: 2}], pressures: [2000], penType: 10, penColor: 0, thickness: 200, times: null}]}],
};

function host(overrides: Partial<PenActionsHost> = {}): PenActionsHost {
  return {
    start: jest.fn(() => ({ok: true as const, value: true as const})),
    stop: () => ({ok: true, value: {tape: TAPE, dropped: 0}}),
    replay: jest.fn(async () => ({ok: true as const, value: {motions: 0, penUps: 1, strokes: 1, listenerErrors: 0}})),
    ...overrides,
  };
}

test('record-pen on starts the recorder, off answers the tape', async () => {
  const fake = host();
  const actions = penActions(fake);
  expect((await actions['record-pen']({on: true})).line).toBe('SmartPen: pen recording on');
  expect(fake.start).toHaveBeenCalled();
  const off = await actions['record-pen']({on: false});
  expect(off).toMatchObject({tape: TAPE, dropped: 0, line: 'SmartPen: pen recording off: 1 events, 0 dropped'});
});

test('record-pen on with every module off is refused before the pen writes (#449)', async () => {
  const actions = penActions(host({start: () => ({ok: false, code: -1, message: 'no pen listener is on: turn the plugin module on first'})}));
  const refused = actions['record-pen']({on: true});
  await expect(refused).rejects.toBeInstanceOf(ActionRefused);
  await expect(refused).rejects.toThrow('no pen listener is on');
});

test('record-pen without on is refused', async () => {
  await expect(penActions(host())['record-pen']({})).rejects.toBeInstanceOf(ActionRefused);
});

test('record-pen off with no recording on fails, never an empty tape', async () => {
  const actions = penActions(host({stop: () => ({ok: false, code: -1, message: 'no pen recording is on'})}));
  await expect(actions['record-pen']({on: false})).rejects.toThrow('no pen recording is on');
});

test('replay-pen plays a good tape and says what it played', async () => {
  const fake = host();
  const answer = await penActions(fake)['replay-pen']({tape: TAPE});
  expect(fake.replay).toHaveBeenCalledWith(TAPE);
  expect(answer.line).toBe('SmartPen: replayed 1 pen-ups (1 strokes) and 0 motions, 0 listener errors');
});

test('replay-pen refuses a bad tape before it plays anything', async () => {
  const fake = host();
  await expect(penActions(fake)['replay-pen']({tape: {version: PEN_TAPE_VERSION + 1, events: []}})).rejects.toBeInstanceOf(ActionRefused);
  expect(fake.replay).not.toHaveBeenCalled();
});

test('a failed replay is a failed action with why', async () => {
  const actions = penActions(host({replay: async () => ({ok: false, code: 1501, message: 'stroke 1: no permission'})}));
  await expect(actions['replay-pen']({tape: TAPE})).rejects.toThrow('stroke 1: no permission');
});

test('the request file is read from Smart Pen\'s hidden folder', async () => {
  const read = jest.fn(async () => ({ok: true as const, value: '{}'}));
  await expect(readActionFile(read)).resolves.toBe('{}');
  expect(read).toHaveBeenCalledWith('/storage/emulated/0/.data/plugin/inktools-smart-pen/action.json');
  expect(ACTION_PATH).toBe('/storage/emulated/0/.data/plugin/inktools-smart-pen/action.json');
});
