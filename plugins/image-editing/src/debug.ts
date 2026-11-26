/**
 * The debug switch of Settings (#134): on the tablet, Remove background clears an object the same
 * code keeps on the Mac, so the input the host gives differs from the JVM fixtures. While it is on,
 * the Java side saves each edit's lasso preview, the picture it edits and, for a cutout, its mask
 * as PNGs in `DEBUG_DIR`, for the Mac lane to pull. Off by default; it resets when Retouch
 * restarts, as every setting does until #40's storage.
 */
import {Result, SHARED_ROOT} from '@ink-tools/sn-adapter/official';
import {REGISTRY} from '@ink-tools/sn-adapter/registry';
import {RetouchSettings} from './edits';
import {RetouchNative} from './native';

/** Image Editing's own folder in the hidden `.data/plugin/`, beside Account Sync's drop folder. */
export const DEBUG_HOME = `${SHARED_ROOT}/${REGISTRY.pluginhostFileSandbox.hiddenFolder}/inktools-image-editing`;

/**
 * In the hidden `.data/plugin/`, which the plugin file guard allows, `adb shell` reads and
 * Supernote Cloud does not sync: in `MyStyle/Retouch/debug` the saved pictures uploaded (#367).
 * Not the private folder, which `adb shell` cannot read (docs/supernote.md › Files and sync).
 * shortcut: a plugin's write there is not yet measured on the tablet; the #367 device round checks it.
 */
export const DEBUG_DIR = `${DEBUG_HOME}/debug`;

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
