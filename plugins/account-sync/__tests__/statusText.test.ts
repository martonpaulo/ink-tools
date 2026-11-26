/** A module's status in plain words, and the same record in the log (#88). */
import {DEVICE_CHECK_PENDING, moduleStatus} from '@ink-tools/sync-core';
import type {ModuleRun} from '@ink-tools/sync-core';
import {defaultSettings} from '@ink-tools/sync-core/settings';
import {
  logBlocked,
  logRun,
  SHOWN_MESSAGES,
  statusLines,
} from '../src/statusText';

const run = (extra: Partial<ModuleRun> = {}): ModuleRun => ({
  module: 'calendar',
  at: new Date(2026, 10, 14, 9, 7).getTime(),
  counts: {added: 2, changed: 0, removed: 1},
  errors: [],
  warnings: [],
  ...extra,
});

describe('statusLines (#88)', () => {
  it('says off, why a module that is on does not run, and that nothing ran yet', () => {
    expect(statusLines({state: 'off'})).toEqual(['Off.']);
    expect(statusLines({state: 'blocked', reasons: ['a', 'b']})).toEqual([
      'On, but not running: a; b.',
    ]);
    expect(statusLines({state: 'waiting'})).toEqual([
      'On. Not synced since Account Sync started.',
    ]);
  });

  it('says a pending device check in one sentence, with one colon (#368)', () => {
    const base = defaultSettings();
    const on = {...base, modules: {...base.modules, todo: true}};
    const [line] = statusLines(moduleStatus('todo', on, {}, {}));
    expect(line).toBe(`On, but not running: ${DEVICE_CHECK_PENDING}.`);
    expect(line.split(':')).toHaveLength(2);
  });

  it('says a module that could not run is not running, why, and when it tried, never «synced»', () => {
    const reasons = Array.from({length: SHOWN_MESSAGES + 1}, (_, i) => `r${i}`);
    expect(
      statusLines({state: 'blocked', reasons, at: run().at}),
    ).toEqual([
      `On, but not running: ${reasons.slice(0, SHOWN_MESSAGES).join('; ')}.`,
      'and 1 more in the log',
      'Last tried 2026-11-14 09:07.',
    ]);
  });

  it('gives the last sync time and the counts of a clean run', () => {
    expect(statusLines({state: 'ran', run: run()})).toEqual([
      'Last synced 2026-11-14 09:07.',
      '2 added, 0 changed, 1 removed',
    ]);
  });

  it('lists the first errors and warnings and counts the rest', () => {
    const errors = Array.from(
      {length: SHOWN_MESSAGES + 2},
      (_, i) => `event ${i}: refused`,
    );
    const lines = statusLines({
      state: 'ran',
      run: run({errors, warnings: ['e1: TZID Europe/Paris is read as UTC']}),
    });
    expect(lines.slice(2)).toEqual([
      `Not synced (${errors.length}):`,
      ...errors.slice(0, SHOWN_MESSAGES),
      'and 2 more in the log',
      'Synced, but read with care (1):',
      'e1: TZID Europe/Paris is read as UTC',
    ]);
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
