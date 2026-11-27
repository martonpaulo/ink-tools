/**
 * A failure a device round asks for (#257): no input makes the tablet's recognition fail on
 * purpose, so `inkctl plugin action smart-pen fail-next-convert` arms one. The next «Convert to
 * Text» then answers this failure in place of the recognition, once, and the tablet shows the
 * failure the person would see. Nothing else arms it, and it lives in memory only: a restart
 * clears it.
 */
import {THROWN_CODE, type Result} from '@ink-tools/sn-adapter/official';

/** The failure's message, as the log line `lasso kept: recognizeElements …` shows it. */
export const ARMED_FAILURE = 'failed on purpose: inkctl armed fail-next-convert';

let armed = false;

/** Makes the next recognition answer `ARMED_FAILURE`. */
export function armConvertFailure(): void {
  armed = true;
}

/** `recognize`, which answers `ARMED_FAILURE` once instead of running when a failure is armed. */
export function withArmedFailure<A extends unknown[]>(
  recognize: (...args: A) => Promise<Result<string>>,
): (...args: A) => Promise<Result<string>> {
  return async (...args) => {
    if (armed) {
      armed = false;
      return {ok: false, code: THROWN_CODE, message: ARMED_FAILURE};
    }
    return recognize(...args);
  };
}
