/** Plugin Diagnostics' actions by command (#283): `run-probe`, the same probe as «Run Probe». */
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
  const answer = await runProbeAction({b: 1, a: 2})({});
  spy.mockRestore();
  expect(answer.line).toBe('SNPROBE probe done');
  expect((answer.lines as string[])[0]).toBe('runtime keys: a,b');
});
