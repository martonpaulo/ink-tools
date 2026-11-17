/**
 * The debug switch of Settings (#134): on the tablet, Remove background clears an object the same
 * code keeps on the Mac, so the input the host gives differs from the JVM fixtures. While it is on,
 * the Java side saves each edit's lasso preview, the picture it edits and, for a cutout, its mask
 * as PNGs in `DEBUG_DIR`, for the Mac lane to pull. Off by default; it resets when Retouch
 * restarts, as every setting does until #40's storage.
 */
import {Result, SHARED_ROOT} from '@ink-tools/sn-adapter/official';
import {RetouchSettings} from './edits';
import {RetouchNative} from './native';

/** Under `MyStyle/Retouch/`, whose sweep (#182) reads only its own top-level names. */
export const DEBUG_DIR = `${SHARED_ROOT}/MyStyle/Retouch/debug`;

/** The settings with the switch set, after the Java side took it; unchanged when it refused. */
export async function setDebug(
  settings: RetouchSettings,
  on: boolean,
  native: Pick<RetouchNative, 'setDebugFolder'>,
  log: (line: string) => void,
): Promise<RetouchSettings> {
  const set: Result<boolean> = await native.setDebugFolder(on ? DEBUG_DIR : null);
  if (!set.ok) {
    log(`debug: switch refused: ${set.message}`);
    return settings;
  }
  log(on ? `debug: saving edit input to ${DEBUG_DIR}` : 'debug: off');
  return {...settings, debug: on};
}
