import {runNativeProviderProbe} from './native';

/** Every line the probe logs starts with this tag: `adb logcat -s SNPROBE`. */
export const TAG = 'SNPROBE';

export type Log = (line: string) => void;

/** What a probe found missing, why it needs it, and the steps only the owner can do (#257). */
export type ProbeNeed = {what: string; reason: string; steps: readonly string[]; command?: string};

/** Thrown by a probe that found something missing: the view shows it as the Needs state (#257). */
export class NeedError extends Error {
  constructor(readonly need: ProbeNeed) {
    super(need.what);
  }
}

/** How a probe ended: done, needs something, or failed with the reason when one is known. */
export type ProbeOutcome = {lines: string[]} & (
  | {status: 'done'}
  | {status: 'needs'; need: ProbeNeed}
  | {status: 'failed'; reason?: string}
);

/**
 * THE ONE PLACE to drop a one-off probe. Replace the body, build, install, read logcat.
 * Log what you learned with `log(...)`; throw a `NeedError` for something missing, which the view
 * shows as the Needs state; any other thrown error is logged by `probe` and shown as the Error state.
 * The default body records what the plugin runtime exposes, then runs the native Digest-provider
 * probe (#59), so a fresh install proves the loop and answers whether a plugin can reach Digest.
 */
export async function probeBody(log: Log, runtime: Record<string, unknown>): Promise<void> {
  log(`runtime keys: ${Object.keys(runtime).sort().join(',')}`);
  await runNativeProviderProbe(log);
}

/** Run the probe and log its outcome. Never throws: a failed probe is a result, not a crash. */
export async function probe(
  runtime: Record<string, unknown>,
  sink: (line: string) => void = line => console.log(`${TAG} ${line}`),
  body: typeof probeBody = probeBody,
): Promise<ProbeOutcome> {
  const lines: string[] = [];
  const log: Log = line => {
    lines.push(line);
    sink(line);
  };
  try {
    await body(log, runtime);
    log('probe done');
    return {lines, status: 'done'};
  } catch (e) {
    if (e instanceof NeedError) {
      log(`probe needs: ${e.need.what}: ${e.need.reason}`);
      return {lines, status: 'needs', need: e.need};
    }
    const reason = e instanceof Error ? e.message.trim() || undefined : undefined;
    log(`probe failed: ${reason ?? String(e)}`);
    return {lines, status: 'failed', reason};
  }
}

/** The probe's lines alone, for a caller that only logs them. */
export async function runProbe(
  runtime: Record<string, unknown>,
  sink?: (line: string) => void,
): Promise<string[]> {
  return (await probe(runtime, sink)).lines;
}
