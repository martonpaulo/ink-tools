/** The debug switch of Settings saves each edit's input for the Mac lane (#134). */
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {DEBUG_DIR, setDebug} from '../src/debug';
import {defaultSettings} from '../src/edits';

test('the switch is off by default and turns on and off through the Java side', async () => {
  expect(defaultSettings.debug).toBe(false);
  const native = {setDebugFolder: jest.fn(async () => ok(true))};
  const log = jest.fn();
  const on = await setDebug(defaultSettings, true, native, log);
  expect(native.setDebugFolder).toHaveBeenLastCalledWith(DEBUG_DIR);
  expect(on.debug).toBe(true);
  expect(DEBUG_DIR).toMatch(/\/MyStyle\/Retouch\/debug$/);
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
