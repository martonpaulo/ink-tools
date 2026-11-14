import {runNativeProviderProbe} from '../src/native';

test('a build without the native module says so instead of passing', async () => {
  const lines: string[] = [];
  await runNativeProviderProbe(l => lines.push(l), {});
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('ProbeProviders is missing');
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
