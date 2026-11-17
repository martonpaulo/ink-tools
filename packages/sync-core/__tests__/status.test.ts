import {calendarRun, defaultSettings, moduleStatus, setModule, tasksRun} from '../src';

const AT = Date.UTC(2026, 10, 14, 14, 5);

describe('module status (#88)', () => {
  test('a calendar run keeps its counts, errors and the provider warnings', () => {
    const run = calendarRun(AT, {created: 3, updated: 1, removed: 0, errors: ['Work: HTTP 500']}, ['e1: TZID Europe/Paris is read as UTC']);
    expect(run).toEqual({
      module: 'calendar',
      at: AT,
      counts: {added: 3, changed: 1, removed: 0},
      errors: ['Work: HTTP 500'],
      warnings: ['e1: TZID Europe/Paris is read as UTC'],
    });
  });

  test('a to-do run adds up both directions', () => {
    const counts = {createdLocal: 1, createdRemote: 2, updatedLocal: 0, updatedRemote: 3, removedLocal: 1, removedRemote: 0};
    expect(tasksRun(AT, {links: [], keptLocal: 0, counts, errors: [], warnings: []}).counts).toEqual({added: 3, changed: 3, removed: 1});
  });

  test('off, blocked with the probe reasons, waiting, and ran', () => {
    const off = defaultSettings();
    const on = setModule(off, 'calendar', true);
    const run = calendarRun(AT, {created: 0, updated: 0, removed: 0, errors: []});
    expect(moduleStatus('calendar', off, {calendar: []}, {calendar: run})).toEqual({state: 'off'});
    expect(moduleStatus('calendar', on, {calendar: ['data_info lacks columns: tag']}, {})).toEqual({
      state: 'blocked',
      reasons: ['data_info lacks columns: tag'],
    });
    expect(moduleStatus('calendar', on, {calendar: []}, {})).toEqual({state: 'waiting'});
    expect(moduleStatus('calendar', on, {calendar: []}, {calendar: run})).toEqual({state: 'ran', run});
  });

  test('a run that could not start blocks the module with its reasons and the time it tried (#88)', () => {
    const on = setModule(defaultSettings(), 'todo', true);
    const notRun = {module: 'todo' as const, at: 9, counts: {added: 0, changed: 0, removed: 0}, errors: ['Todoist is not signed in'], warnings: [], notRun: true as const};
    expect(moduleStatus('todo', on, {todo: []}, {todo: notRun})).toEqual({state: 'blocked', reasons: ['Todoist is not signed in'], at: 9});
  });

  test('a module with no probe answer is blocked, never shown as ready', () => {
    const on = setModule(defaultSettings(), 'todo', true);
    expect(moduleStatus('todo', on, {}, {})).toEqual({state: 'blocked', reasons: ['the device check has not answered']});
  });
});
