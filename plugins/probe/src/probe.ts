import {runNativeListenProbe} from './native';

/** Every line the probe logs starts with this tag: `adb logcat -s SNPROBE`. */
export const TAG = 'SNPROBE';

export type Log = (line: string) => void;

/**
 * THE ONE PLACE to drop a one-off probe. Replace the body, build, install, read logcat.
 * Log what you learned with `log(...)`; a thrown error is logged by `runProbe` and shown in the view.
 * The default body records what the plugin runtime exposes, then runs the native Digest-provider
 * probe (#59), so a fresh install proves the loop and answers whether a plugin can reach Digest.
 */
export async function probeBody(log: Log, runtime: Record<string, unknown>): Promise<void> {
  log(`runtime keys: ${Object.keys(runtime).sort().join(',')}`);
  await runNativeListenProbe(log);
}

/** Run the probe and log its outcome. Never throws: a failed probe is a result, not a crash. */
export async function runProbe(
  runtime: Record<string, unknown>,
  sink: (line: string) => void = line => console.log(`${TAG} ${line}`),
): Promise<string[]> {
  const lines: string[] = [];
  const log: Log = line => {
    lines.push(line);
    sink(line);
  };
  try {
    await probeBody(log, runtime);
    log('probe done');
  } catch (e) {
    log(`probe failed: ${(e as Error).message}`);
  }
  return lines;
}
