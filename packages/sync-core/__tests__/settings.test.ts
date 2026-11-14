import {
  activePlan,
  defaultSettings,
  parseSettings,
  serializeSettings,
  setModule,
  setProvider,
} from '../src/settings';

test('everything is off by default', () => {
  const s = defaultSettings();
  expect(Object.values(s.modules).concat(Object.values(s.providers)).some(Boolean)).toBe(false);
});

test('a provider needs its module on; turning the module off clears its providers', () => {
  let s = defaultSettings();
  expect(() => setProvider(s, 'google', true)).toThrow(/calendar module/);
  s = setProvider(setModule(s, 'calendar', true), 'google', true);
  s = setProvider(s, 'ics', true);
  s = setModule(s, 'calendar', false);
  expect(s.providers.google).toBe(false);
  expect(s.providers.ics).toBe(false);
});

test('serialize then parse round-trips; unknown keys drop; bad input throws', () => {
  const s = setModule(defaultSettings(), 'todo', true);
  expect(parseSettings(serializeSettings(s))).toEqual(s);
  const withExtra = JSON.stringify({...s, modules: {...s.modules, extra: true}});
  expect(parseSettings(withExtra)).toEqual(s);
  expect(() => parseSettings('{"schema":2}')).toThrow(/schema/);
  expect(() => parseSettings('{"schema":1,"modules":{"todo":"yes"},"providers":{}}')).toThrow(/boolean/);
  expect(() => parseSettings('{"schema":1}')).toThrow(/modules missing/);
});

test('the plan runs only opted-in modules the probe proved, and reports the blocked ones', () => {
  let s = setProvider(setModule(defaultSettings(), 'calendar', true), 'google', true);
  s = setProvider(setModule(s, 'todo', true), 'todoist', true);
  expect(activePlan(s, {calendar: true, todo: false})).toEqual({
    modules: ['calendar'],
    providers: ['google'],
    blocked: ['todo'],
  });
  // no probe answer at all: nothing runs
  expect(activePlan(s, {})).toEqual({modules: [], providers: [], blocked: ['todo', 'calendar']});
});
