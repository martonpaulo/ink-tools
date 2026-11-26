import {runNativeListenProbe, runNativeProviderProbe} from '../src/native';
import {NeedError} from '../src/probe';

const needOf = async (run: Promise<void>) => {
  const error = await run.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(NeedError);
  return (error as NeedError).need;
};

test('a build without the native module needs the native step instead of passing (#257)', async () => {
  const lines: string[] = [];
  const need = await needOf(runNativeProviderProbe(l => lines.push(l), {}));
  expect(lines).toEqual([]);
  expect(need.what).toContain('ProbeProviders is missing');
  expect(need.steps[0]).toContain('npm -C plugins/plugin-diagnostics run build');
});

test('logs each native line, then starts the heartbeat', async () => {
  const lines: string[] = [];
  const startHeartbeat = jest.fn();
  const run = jest.fn().mockResolvedValue(['digest query DENIED SecurityException: x']);
  await runNativeProviderProbe(l => lines.push(l), {ProbeProviders: {run, startHeartbeat}});
  expect(lines[0]).toBe('native: digest query DENIED SecurityException: x');
  expect(startHeartbeat).toHaveBeenCalledTimes(1);
});

test('a native failure propagates so runProbe logs it', async () => {
  const run = jest.fn().mockRejectedValue(new Error('boom'));
  await expect(runNativeProviderProbe(jest.fn(), {ProbeProviders: {run, startHeartbeat: jest.fn()}})).rejects.toThrow('boom');
});

test('a build without the listener needs the native step instead of passing (#91, #257)', async () => {
  const need = await needOf(runNativeListenProbe(jest.fn(), {ProbeProviders: {run: jest.fn(), startHeartbeat: jest.fn()}}));
  expect(need.what).toContain('has no listener');
});

test('logs the port and addresses of the listener and how to reach it (#91)', async () => {
  const lines: string[] = [];
  const startListener = jest.fn().mockResolvedValue(['listen open OK port 40123', 'listen address OK wlan0 198.51.100.7']);
  await runNativeListenProbe(l => lines.push(l), {ProbeProviders: {startListener}});
  expect(lines[0]).toBe('native: listen open OK port 40123');
  expect(lines[1]).toBe('native: listen address OK wlan0 198.51.100.7');
  expect(lines[2]).toContain('nc <address> <port>');
});
