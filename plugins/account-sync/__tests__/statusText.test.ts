/** A module's status in plain words, and the same record in the log (#88). */
import {DEVICE_CHECK_PENDING, moduleStatus} from '@ink-tools/sync-core';
import type {ModuleRun} from '@ink-tools/sync-core';
import {defaultSettings} from '@ink-tools/sync-core/settings';
import {
  logBlocked,
  logRun,
  SHOWN_MESSAGES,
  statusLine,
} from '../src/statusText';

const run = (extra: Partial<ModuleRun> = {}): ModuleRun => ({
  module: 'calendar',
  at: new Date(2026, 10, 14, 9, 7).getTime(),
  counts: {added: 2, changed: 0, removed: 1},
  errors: [],
  warnings: [],
  ...extra,
});

const AT = new Date(2026, 10, 14, 9, 7).getTime();
const SAME_DAY = new Date(2026, 10, 14, 18, 0).getTime();
const ABOUT = 'Syncs Calendar with Google.';
const say = (status: Parameters<typeof statusLine>[0], now = SAME_DAY) =>
  statusLine(status, ABOUT, now);

describe('statusLine (#88, #411)', () => {
  it('says what an off module does, why one that is on does not run, and that nothing ran yet', () => {
    expect(say({state: 'off'})).toBe(ABOUT);
    expect(say({state: 'blocked', reasons: ['a', 'b']})).toBe('On, but not running: a; b.');
    expect(say({state: 'waiting'})).toBe('Not synced yet.');
  });

  it('says a pending device check in one sentence, with one colon (#368)', () => {
    const base = defaultSettings();
    const on = {...base, modules: {...base.modules, todo: true}};
    const said = say(moduleStatus('todo', on, {}, {}));
    expect(said).toBe(`On, but not running: ${DEVICE_CHECK_PENDING}.`);
    expect(said.split(':')).toHaveLength(2);
  });

  it('says a module that could not run is not running, why, and when it tried, never «synced»', () => {
    const reasons = Array.from({length: SHOWN_MESSAGES + 1}, (_, i) => `r${i}`);
    expect(say({state: 'blocked', reasons, at: AT})).toBe(
      `On, but not running: ${reasons.slice(0, SHOWN_MESSAGES).join('; ')}. Last tried at 09:07.`,
    );
  });

  it('says «no changes» for a zero count, never «0 added, 0 changed, 0 removed»', () => {
    const zero = run({counts: {added: 0, changed: 0, removed: 0}});
    expect(say({state: 'ran', run: zero})).toBe('Synced at 09:07 · no changes');
  });

  it('names one item in the singular and more in the plural, leaving zero counts out', () => {
    const one = run({counts: {added: 0, changed: 0, removed: 1}});
    expect(say({state: 'ran', run: one})).toBe('Synced at 09:07 · 1 event removed');
    const many = run({module: 'todo', counts: {added: 2, changed: 1, removed: 0}});
    expect(say({state: 'ran', run: many})).toBe('Synced at 09:07 · 2 tasks added, 1 task changed');
  });

  it('gives the date of a sync on another day', () => {
    expect(say({state: 'ran', run: run()}, AT + 2 * 24 * 3600 * 1000)).toMatch(/^Synced at 2026-11-14 09:07 · /);
  });

  it('says only that some items failed or synced in part; the messages stay in the log', () => {
    const said = say({
      state: 'ran',
      run: run({errors: ['event 1: refused'], warnings: ['e1: TZID Europe/Paris is read as UTC']}),
    });
    expect(said).toBe('Synced at 09:07 · 2 events added, 1 event removed, some events not synced, some events synced in part');
    expect(said).not.toMatch(/\(s\)|\(\d+\)|read with care|TZID/);
  });
});

describe('the log record (#88)', () => {
  it('writes every message with the plugin tag inkctl filters on', () => {
    const lines: string[] = [];
    logRun(
      run({errors: ['x: HTTP 500'], warnings: ['y: unsupported FREQ HOURLY']}),
      line => lines.push(line),
    );
    expect(lines).toEqual([
      `[Bridge] sync calendar: ${new Date(
        run().at,
      ).toISOString()}, 2 added, 0 changed, 1 removed, 1 errors, 1 warnings`,
      '[Bridge] sync calendar error: x: HTTP 500',
      '[Bridge] sync calendar warning: y: unsupported FREQ HOURLY',
    ]);
  });

  it('writes a run that could not start as one «not run» line', () => {
    const lines: string[] = [];
    logRun(
      run({errors: ['google: HTTP 401', 'ics: offline'], notRun: true}),
      line => lines.push(line),
    );
    expect(lines).toEqual([
      '[Bridge] sync calendar: not run: google: HTTP 401; ics: offline',
    ]);
  });

  it('writes why a module that is on did not run', () => {
    const lines: string[] = [];
    logBlocked('todo', ['the device check has not answered'], line =>
      lines.push(line),
    );
    expect(lines).toEqual([
      '[Bridge] sync todo: not run: the device check has not answered',
    ]);
  });
});
