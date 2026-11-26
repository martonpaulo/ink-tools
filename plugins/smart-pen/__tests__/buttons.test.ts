import {
  Buttons,
  LASSO_BUTTON_ID,
  MODE_BUTTON_ID,
  UNDO_BUTTON_ID,
} from '../src/modules/text/buttons';
import {copy} from '../src/modules/text/copy';
import {
  Converter,
  setLastConversion,
  DEFAULT_WORD_OPTIONS,
} from '@ink-tools/ink-core/conversion';
import {DEFAULT_SETTINGS, setSettings} from '../src/modules/text/settings';
import {fakeTablet} from '../test-support/host';
import {letter} from '../../../packages/ink-core/testing/ink';

function setup(granted = true, tipShown = true) {
  const tablet = fakeTablet();
  const toasts: string[] = [];
  const tips: string[] = [];
  const host = {
    register: jest.fn(async () => ({ok: true as const, value: true as const})),
    unregister: jest.fn(async () => ({
      ok: true as const,
      value: true as const,
    })),
    hasPermission: jest.fn(async () => ({ok: true as const, value: granted})),
    requestPermission: jest.fn(async () => ({ok: true as const, value: 2})),
    makeConverter: () => new Converter(tablet.host, DEFAULT_WORD_OPTIONS),
    undo: tablet.host,
    lasso: tablet.host,
    toast: (text: string) => toasts.push(text),
    errorTip: (text: string) => {
      tips.push(text);
      return tipShown
        ? ({ok: true as const, value: true as const})
        : ({ok: false as const, code: -1, message: 'no window'});
    },
    log: () => {},
    icons: {
      on: 'on.png',
      off: 'off.png',
      undo: 'undo.png',
      lasso: 'convert.png',
    },
  };
  return {tablet, toasts, tips, host, buttons: new Buttons(host)};
}

beforeEach(() => {
  setSettings(DEFAULT_SETTINGS);
  setLastConversion(null);
});

test('every button registers at start-up, the switch off by default', async () => {
  const {host, buttons, tablet} = setup();
  await buttons.registerAll();
  expect(host.register).toHaveBeenCalledWith(
    2,
    ['NOTE'],
    expect.objectContaining({
      id: LASSO_BUTTON_ID,
      name: 'Convert to Text',
      editDataTypes: [0],
      showType: 0,
    }),
  );
  expect(host.register).toHaveBeenCalledWith(
    1,
    ['NOTE'],
    expect.objectContaining({id: UNDO_BUTTON_ID, name: 'Undo Conversion'}),
  );
  expect(host.register).toHaveBeenCalledWith(
    1,
    ['NOTE'],
    expect.objectContaining({
      id: MODE_BUTTON_ID,
      name: 'Real-Time Text',
      icon: 'off.png',
    }),
  );
  expect(buttons.on).toBe(false);
  expect(tablet.listening).toBe(false);
});

test('«Start with Real-Time Text on» starts listening at start-up', async () => {
  setSettings({...DEFAULT_SETTINGS, startOn: true});
  const {buttons, tablet} = setup();
  await buttons.registerAll();
  expect(buttons.on).toBe(true);
  expect(tablet.listening).toBe(true);
});

test('switching the module off stops the mode and removes every button (#305)', async () => {
  const {host, buttons, tablet} = setup();
  await buttons.registerAll();
  await buttons.turn(true, false);
  host.unregister.mockClear();
  await buttons.unregisterAll();
  expect(buttons.on).toBe(false);
  expect(tablet.listening).toBe(false);
  expect(host.unregister.mock.calls).toEqual([
    [LASSO_BUTTON_ID],
    [UNDO_BUTTON_ID],
    [MODE_BUTTON_ID],
  ]);
});

test('a press switches the mode, its icon and says so', async () => {
  const {host, buttons, tablet, toasts} = setup();
  await buttons.turn(true);
  expect(tablet.listening).toBe(true);
  expect(host.register).toHaveBeenLastCalledWith(
    1,
    ['NOTE'],
    expect.objectContaining({icon: 'on.png'}),
  );
  await buttons.turn(false);
  expect(tablet.listening).toBe(false);
  expect(host.register).toHaveBeenLastCalledWith(
    1,
    ['NOTE'],
    expect.objectContaining({icon: 'off.png'}),
  );
  expect(toasts).toEqual([copy['toast.on'], copy['toast.off']]);
  expect(buttons.press(MODE_BUTTON_ID)).toBe(true);
  expect(buttons.press(999)).toBe(false);
});

test('a pen-up listener the host refuses shows the host error tip, nothing to retry (#296)', async () => {
  const {buttons, tablet, toasts, tips} = setup();
  tablet.host.onPenUp = () => ({ok: false, code: -1, message: 'refused'});
  expect(await buttons.turn(true)).toBe(false);
  expect(tips).toEqual([copy['toast.failed']]);
  expect(toasts).toEqual([]);
  expect(buttons.on).toBe(false);
});

test('when the error tip cannot show, a toast says it instead (#296)', async () => {
  const {buttons, tablet, toasts} = setup(true, false);
  tablet.host.onPenUp = () => ({ok: false, code: -1, message: 'refused'});
  expect(await buttons.turn(true)).toBe(false);
  expect(toasts).toEqual([copy['toast.failed']]);
});

test('without the file permissions the mode stays off and asks for them', async () => {
  const {host, buttons, tablet, toasts} = setup(false);
  expect(await buttons.turn(true)).toBe(false);
  expect(tablet.listening).toBe(false);
  expect(host.requestPermission).toHaveBeenCalled();
  expect(toasts).toEqual([copy['toast.permission']]);
});

test('Undo Conversion with nothing converted says so', async () => {
  const {buttons, toasts} = setup();
  expect(await buttons.undo()).toBe('nothing');
  expect(toasts).toEqual([copy['toast.nothing']]);
});

test('«Convert to Text» converts the lasso and says so; without the permissions it asks first', async () => {
  const {tablet, toasts, buttons} = setup();
  tablet.lassoStrokes([letter(0), letter(30)]);
  expect(await buttons.convertLasso()).toBe('converted');
  expect(toasts).toEqual([copy['toast.converted']]);
  const denied = setup(false);
  expect(await denied.buttons.convertLasso()).toBeNull();
  expect(denied.toasts).toEqual([copy['toast.permission']]);
  expect(denied.tablet.host.getLassoElements).not.toHaveBeenCalled();
});
