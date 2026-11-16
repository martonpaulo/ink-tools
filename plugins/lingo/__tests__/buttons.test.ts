/** One lasso button per enabled direction, registered and removed with its switch (#128). */
import {defaultSettings, PAIRS, setPair} from '@supernote-tools/ink-core';
import {ok} from '@supernote-tools/sn-adapter/official';
import {
  ALL_BUTTONS,
  buttonOf,
  ButtonDeps,
  enabledButtons,
  resetButtonsForTests,
  settingsChanged,
  syncButtons,
} from '../src/buttons';

const deps = (granted = true) => {
  const calls: string[] = [];
  const d: ButtonDeps = {
    register: jest.fn(async (_type, _apps, config: {name?: string}) => {
      calls.push(`+${config.name}`);
      return ok(true as const);
    }),
    unregister: jest.fn(async id => {
      calls.push(`-${buttonOf(id)?.name}`);
      return ok(true as const);
    }),
    hasPermission: jest.fn(async () => ok(granted)),
    requestPermission: jest.fn(async () => ok(2)),
    log: () => {},
  };
  return {d, calls};
};

beforeEach(resetButtonsForTests);

test('every pair gives two buttons with distinct ids and arrow names', () => {
  expect(ALL_BUTTONS).toHaveLength(PAIRS.length * 2);
  expect(new Set(ALL_BUTTONS.map(b => b.id)).size).toBe(ALL_BUTTONS.length);
  expect(ALL_BUTTONS.map(b => b.name)).toEqual([
    'ES→PT',
    'PT→ES',
    'ZH→PT',
    'PT→ZH',
  ]);
  expect(buttonOf(ALL_BUTTONS[2].id)).toMatchObject({from: 'zh', to: 'pt'});
  expect(buttonOf(1)).toBeNull();
});

test('only the directions switched on have buttons', () => {
  expect(enabledButtons(defaultSettings())).toEqual([]);
  const zh = setPair(defaultSettings(), 'zh-pt', true);
  expect(enabledButtons(zh).map(b => b.name)).toEqual(['ZH→PT', 'PT→ZH']);
});

test('a switch registers its pair once and removes it when off', async () => {
  const {d, calls} = deps();
  const on = setPair(defaultSettings(), 'es-pt', true);
  await syncButtons(on, d);
  await syncButtons(on, d);
  await syncButtons(defaultSettings(), d);
  expect(calls).toEqual(['+ES→PT', '+PT→ES', '-ES→PT', '-PT→ES']);
});

test('a failed registration is tried again on the next change', async () => {
  const {d} = deps();
  (d.register as jest.Mock).mockResolvedValueOnce({
    ok: false,
    code: -1,
    message: 'no',
  });
  const on = setPair(defaultSettings(), 'es-pt', true);
  await syncButtons(on, d);
  await syncButtons(on, d);
  expect(d.register).toHaveBeenCalledTimes(3);
});

test('the first pair on asks for Internet and file read only when not granted', async () => {
  const on = setPair(defaultSettings(), 'zh-pt', true);
  const granted = deps(true);
  await settingsChanged(on, granted.d);
  expect(granted.d.requestPermission).not.toHaveBeenCalled();
  resetButtonsForTests();
  const missing = deps(false);
  await settingsChanged(on, missing.d);
  expect(missing.d.requestPermission).toHaveBeenCalledWith(
    'plugin.permission.INTERNET',
    expect.any(String),
  );
  expect(missing.d.requestPermission).toHaveBeenCalledWith(
    'plugin.permission.FILE:READ',
    expect.any(String),
  );
  resetButtonsForTests();
  const off = deps(false);
  await settingsChanged(defaultSettings(), off.d);
  expect(off.d.hasPermission).not.toHaveBeenCalled();
});
