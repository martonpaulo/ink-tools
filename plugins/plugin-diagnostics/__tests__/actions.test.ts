/** Plugin Diagnostics' actions by command (#283): `run-probe`, the same probe as «Run Probe». */
import {NativeModules} from 'react-native';
import {ACTION_PATH, readActionFile, runProbeAction} from '../src/actions';
import {PROBE_FOLDER} from '../src/helper';

test('the request file is action.json in the Probe folder, read by readCommand', async () => {
  expect(ACTION_PATH).toBe(`${PROBE_FOLDER}action.json`);
  const readCommand = jest.fn().mockResolvedValue('{"id":"a1b2c3d4"}');
  expect(await readActionFile({ProbeProviders: {readCommand}})).toBe('{"id":"a1b2c3d4"}');
  expect(readCommand).toHaveBeenCalledWith(ACTION_PATH);
  await expect(readActionFile({})).rejects.toThrow('no readCommand');
});

test('run-probe runs the probe and answers its lines, the last one as its line', async () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  NativeModules.ProbeProviders = {run: jest.fn().mockResolvedValue(['digest query OK']), startHeartbeat: jest.fn()};
  const answer = await runProbeAction({b: 1, a: 2})({});
  delete NativeModules.ProbeProviders;
  spy.mockRestore();
  expect(answer.line).toBe('SNPROBE probe done');
  expect((answer.lines as string[])[0]).toBe('runtime keys: a,b');
});

test('run-probe fails, never a success, when the probe needs the native step (#257)', async () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await expect(runProbeAction({})({})).rejects.toThrow('probe needs: The native module ProbeProviders is missing');
  spy.mockRestore();
});

test('the action channel ticks on the native ProbeTicks timer, which runs with no view open (#283)', () => {
  const fs = require('fs');
  const path = require('path');
  const index: string = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const java: string = fs.readFileSync(
    path.join(__dirname, '..', 'native/src/com/probe/providers/ProbePackage.java'),
    'utf8',
  );
  expect(java).toContain('new TickModule(context, "ProbeTicks")');
  expect(index).toContain("timers: nativeTimers('ProbeTicks')");
});
