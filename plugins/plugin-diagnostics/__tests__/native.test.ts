import {runNativeListenProbe, runNativeProviderProbe} from '../src/native';

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

test('a build without the listener says so instead of passing (#91)', async () => {
  const lines: string[] = [];
  await runNativeListenProbe(l => lines.push(l), {ProbeProviders: {run: jest.fn(), startHeartbeat: jest.fn()}});
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('no startListener');
});

test('logs the port and addresses of the listener and how to reach it (#91)', async () => {
  const lines: string[] = [];
  const startListener = jest.fn().mockResolvedValue(['listen open OK port 40123', 'listen address OK wlan0 198.51.100.7']);
  await runNativeListenProbe(l => lines.push(l), {ProbeProviders: {startListener}});
  expect(lines[0]).toBe('native: listen open OK port 40123');
  expect(lines[1]).toBe('native: listen address OK wlan0 198.51.100.7');
  expect(lines[2]).toContain('nc <address> <port>');
});
