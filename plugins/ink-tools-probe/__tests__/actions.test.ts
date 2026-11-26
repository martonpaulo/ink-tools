/** Ink Tools Probe's actions by command (#283): `run-probe`, the same probe as «Run Probe». */
import {NativeModules} from 'react-native';
import {ACTION_PATH, readActionFile, removeLegacyFiles, runProbeAction} from '../src/actions';
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

test('the channel lives in the hidden .data/plugin/, never in a MyStyle folder Supernote Cloud syncs (#148, #22)', () => {
  expect(PROBE_FOLDER).toBe('/storage/emulated/0/.data/plugin/inktools-probe/');
  expect(PROBE_FOLDER).not.toContain('MyStyle');
});

test('the start removes the files old builds left in MyStyle/Probe and logs how many (#148)', async () => {
  const lines: string[] = [];
  const remove = jest.fn().mockResolvedValue(3);
  await removeLegacyFiles({ProbeProviders: {removeLegacyFiles: remove}}, line => lines.push(line));
  expect(remove).toHaveBeenCalledTimes(1);
  expect(lines).toEqual(['SNPROBE legacy files: removed 3 from MyStyle/Probe']);
  await removeLegacyFiles({ProbeProviders: {removeLegacyFiles: jest.fn().mockResolvedValue(0)}}, line => lines.push(line));
  expect(lines).toHaveLength(1);
  await removeLegacyFiles({ProbeProviders: {removeLegacyFiles: jest.fn().mockRejectedValue(new Error('denied'))}}, line => lines.push(line));
  await removeLegacyFiles({}, line => lines.push(line));
  expect(lines.slice(1)).toEqual([
    'SNPROBE legacy files: denied',
    'SNPROBE legacy files: native module ProbeProviders has no removeLegacyFiles',
  ]);
});
