import type {DeviceEvent, TodoTask} from '@ink-tools/sn-adapter';
import type {CalendarEvent, DeviceTask} from '../src';

/**
 * The adapter and sync-core stay independent, so each keeps its own copy of two row types (#86).
 * `tsc` fails this file when a field is added to or renamed on one side only: each pair must be
 * assignable both ways. A test-only import; no source file of sync-core imports the adapter.
 */
const assertSame = <A, B>(_a?: A & B, _b?: B & A): void => undefined;

test('the adapter row types and the sync-core types are the same shape', () => {
  const event = {} as CalendarEvent;
  const deviceEvent = {} as DeviceEvent;
  const task = {} as DeviceTask;
  const todoTask = {} as TodoTask;
  const asDeviceEvent: DeviceEvent = event;
  const asCalendarEvent: CalendarEvent = deviceEvent;
  const asTodoTask: TodoTask = task;
  const asDeviceTask: DeviceTask = todoTask;
  assertSame(asDeviceEvent, asCalendarEvent);
  assertSame(asTodoTask, asDeviceTask);
  expect(true).toBe(true);
});
