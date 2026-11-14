import {LANGUAGES} from '../src/dictionary';
import {
  defaultSettings,
  enabledDirections,
  PAIRS,
  parseSettings,
  serializeSettings,
  setPair,
} from '../src/pairs';

test('the pairs are PT with ES and PT with ZH, each id unique and of two known languages', () => {
  expect(PAIRS.map(p => p.id)).toEqual(['es-pt', 'zh-pt']);
  expect(new Set(PAIRS.map(p => p.id)).size).toBe(PAIRS.length);
  for (const {languages: [a, b]} of PAIRS) {
    expect(LANGUAGES).toContain(a);
    expect(LANGUAGES).toContain(b);
    expect(a).not.toBe(b);
  }
});

test('every pair is off by default, so nothing translates until opted in', () => {
  expect(defaultSettings().pairs).toEqual({'es-pt': false, 'zh-pt': false});
  expect(enabledDirections(defaultSettings())).toEqual([]);
});

test('one toggle opens both directions of its pair', () => {
  const s = setPair(defaultSettings(), 'zh-pt', true);
  expect(enabledDirections(s)).toEqual([
    {from: 'zh', to: 'pt'},
    {from: 'pt', to: 'zh'},
  ]);
  expect(enabledDirections(setPair(s, 'zh-pt', false))).toEqual([]);
  expect(() => setPair(s, 'en-pt', true)).toThrow(/unknown pair/);
});

test('serialize then parse round-trips; unknown keys drop; a missing pair keeps its default', () => {
  const s = setPair(defaultSettings(), 'es-pt', true);
  expect(parseSettings(serializeSettings(s))).toEqual(s);
  expect(parseSettings('{"schema":1,"pairs":{"es-pt":true,"en-pt":true}}')).toEqual(s);
  // Settings saved before a pair existed still load, with the new pair off.
  expect(parseSettings('{"schema":1,"pairs":{}}')).toEqual(defaultSettings());
});

test('a wrong schema or shape throws instead of silently resetting', () => {
  expect(() => parseSettings('null')).toThrow(/not an object/);
  expect(() => parseSettings('{"schema":2,"pairs":{}}')).toThrow(/schema/);
  expect(() => parseSettings('{"schema":1}')).toThrow(/pairs missing/);
  expect(() => parseSettings('{"schema":1,"pairs":{"es-pt":"yes"}}')).toThrow(/boolean/);
});
