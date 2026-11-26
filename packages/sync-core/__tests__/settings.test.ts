import {
  activePlan,
  addIcsFeed,
  icsFeedName,
  MAX_ICS_FEEDS,
  removeIcsFeed,
  defaultSettings,
  parseSettings,
  serializeSettings,
  setModule,
  setProvider,
  setDefaultCalendar,
  setSendTabletOnly,
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
  const proved = {available: true, canWrite: true};
  expect(activePlan(s, {calendar: proved, todo: {available: false, canWrite: false}})).toEqual({
    modules: ['calendar'],
    providers: ['google'],
    blocked: ['todo'],
    sendTabletOnly: {todo: false, calendar: false},
  });
  // no probe answer at all: nothing runs
  expect(activePlan(s, {})).toEqual({modules: [], providers: [], blocked: ['todo', 'calendar'], sendTabletOnly: {todo: false, calendar: false}});
});

test('the plan blocks a module whose reads pass but whose writes are refused (#67)', () => {
  const s = setModule(setModule(defaultSettings(), 'calendar', true), 'todo', true);
  expect(activePlan(s, {calendar: {available: true, canWrite: false}, todo: {available: true, canWrite: true}})).toEqual({
    modules: ['todo'],
    providers: [],
    blocked: ['calendar'],
    sendTabletOnly: {todo: false, calendar: false},
  });
});

test('«Send tablet-only items» is off by default, round-trips, and a wrong type throws', () => {
  expect(defaultSettings().sendTabletOnly).toEqual({todo: false, calendar: false});
  const on = setSendTabletOnly({...defaultSettings(), firstLinked: {todo: 1000}}, 'todo', true);
  expect(parseSettings(serializeSettings(on))).toEqual(on);
  expect(parseSettings(JSON.stringify({schema: 1, modules: {}, providers: {}})).sendTabletOnly).toEqual({todo: false, calendar: false});
  expect(() => parseSettings(JSON.stringify({schema: 1, modules: {}, providers: {}, sendTabletOnly: {todo: 'yes'}}))).toThrow('settings: sendTabletOnly.todo is not a boolean');
});

test('an ICS feed is named by its place and host, never its path (#30)', () => {
  expect(icsFeedName('webcal://feeds.example.com/private/token-1/a.ics', 0)).toBe('ICS 1 (feeds.example.com)');
  expect(icsFeedName('https://cal.example.org/b.ics?key=secret', 2)).toBe('ICS 3 (cal.example.org)');
});

test('ICS feed addresses: none by default, https or webcal kept once, round-trip, a bad one throws (#30)', () => {
  expect(defaultSettings().icsFeeds).toEqual([]);
  let s = addIcsFeed(defaultSettings(), ' webcal://feeds.example.com/a.ics ');
  s = addIcsFeed(addIcsFeed(s, 'https://feeds.example.com/b.ics'), 'https://feeds.example.com/b.ics');
  expect(s.icsFeeds).toEqual(['webcal://feeds.example.com/a.ics', 'https://feeds.example.com/b.ics']);
  expect(parseSettings(serializeSettings(s)).icsFeeds).toEqual(s.icsFeeds);
  expect(removeIcsFeed(s, 'https://feeds.example.com/b.ics').icsFeeds).toEqual(['webcal://feeds.example.com/a.ics']);
  expect(() => addIcsFeed(s, 'http://feeds.example.com/c.ics')).toThrow('https: or webcal:');
  expect(() => addIcsFeed(s, 'feeds.example.com/c.ics')).toThrow('https: or webcal:');
  const stored = JSON.parse(serializeSettings(s));
  expect(() => parseSettings(JSON.stringify({...stored, icsFeeds: 'x'}))).toThrow('icsFeeds');
  expect(() => parseSettings(JSON.stringify({...stored, icsFeeds: [3]}))).toThrow('icsFeeds');
  expect(() => parseSettings(JSON.stringify({...stored, icsFeeds: ['ftp://x/y']}))).toThrow('https: or webcal:');
  const {icsFeeds: _gone, ...older} = stored;
  expect(parseSettings(JSON.stringify(older)).icsFeeds).toEqual([]);
  let full = defaultSettings();
  for (let i = 0; i < MAX_ICS_FEEDS; i++) full = addIcsFeed(full, `https://feeds.example.com/${i}.ics`);
  expect(() => addIcsFeed(full, 'https://feeds.example.com/more.ics')).toThrow(`at most ${MAX_ICS_FEEDS}`);
});

test('the calendar for new tablet events: none by default, chosen, cleared, round-trips, a wrong one throws (#29)', () => {
  expect(defaultSettings().defaultCalendarId).toBeUndefined();
  const chosen = setDefaultCalendar(defaultSettings(), 'g1');
  expect(chosen.defaultCalendarId).toBe('g1');
  expect(parseSettings(serializeSettings(chosen))).toEqual(chosen);
  const cleared = setDefaultCalendar(chosen, undefined);
  expect('defaultCalendarId' in cleared).toBe(false);
  expect(parseSettings(serializeSettings(cleared))).toEqual(defaultSettings());
  const stored = JSON.parse(serializeSettings(defaultSettings()));
  expect(() => parseSettings(JSON.stringify({...stored, defaultCalendarId: 3}))).toThrow('defaultCalendarId');
  expect(() => parseSettings(JSON.stringify({...stored, defaultCalendarId: ''}))).toThrow('defaultCalendarId');
});
