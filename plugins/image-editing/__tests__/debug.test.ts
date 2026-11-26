/** The debug switch of Settings saves each edit's input for the Mac lane (#134). */
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {SHARED_ROOT} from '@ink-tools/sn-adapter/official';
import {readFileSync} from 'fs';
import {join} from 'path';
import {DEBUG_DIR, DEBUG_HOME, setDebug} from '../src/debug';
import {defaultSettings} from '../src/edits';

test('the switch is off by default and turns on and off through the Java side', async () => {
  expect(defaultSettings.debug).toBe(false);
  const native = {setDebugFolder: jest.fn(async () => ok(true))};
  const log = jest.fn();
  const on = await setDebug(defaultSettings, true, native, log);
  expect(native.setDebugFolder).toHaveBeenLastCalledWith(DEBUG_DIR);
  expect(on.debug).toBe(true);
  const off = await setDebug(on, false, native, log);
  expect(native.setDebugFolder).toHaveBeenLastCalledWith(null);
  expect(off.debug).toBe(false);
});

test('a switch the Java side refuses stays as it was, logged', async () => {
  const native = {setDebugFolder: jest.fn(async () => fail(1, 'outside the whitelist'))};
  const log = jest.fn();
  await expect(setDebug(defaultSettings, true, native, log)).resolves.toBe(defaultSettings);
  expect(log).toHaveBeenCalledWith('debug: switch refused: outside the whitelist');
});

test('the debug folder is one Supernote Cloud does not sync (#367)', () => {
  // MyStyle/ and EXPORT/ upload to the cloud; the saved pictures stay on the tablet.
  for (const synced of ['MyStyle', 'EXPORT', 'Note', 'Document']) {
    expect(DEBUG_DIR.startsWith(`${SHARED_ROOT}/${synced}/`)).toBe(false);
  }
  expect(DEBUG_DIR).toBe(`${SHARED_ROOT}/.data/plugin/inktools-image-editing/debug`);
});

test("the Java file guard allows the debug folder's home, the same folder (#367)", () => {
  const java = readFileSync(
    join(__dirname, '../native/src/com/retouch/image/RetouchPackage.java'),
    'utf8',
  );
  const home = DEBUG_HOME.split('/').pop();
  expect(java).toContain(`HIDDEN_FOLDER + "/${home}"`);
  expect(java).toContain('Roots.plugin(PLUGIN_ID, "Retouch", DEBUG_HOME)');
});
