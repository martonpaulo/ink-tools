import {Descriptor, column} from './descriptor';
import {Row, toCalendarInsert} from './rules';

/** Structurally the same shape as sync-core's CalendarEvent, so the two packages stay independent. */
export interface DeviceEvent {
  eventId: string;
  calendarId: string;
  title: string;
  content: string;
  start: number;
  end: number;
  allDay: boolean;
}

/**
 * The data_info row for an event, tagged so the native Google sync leaves it alone.
 * shortcut: startTime/endTime are written as epoch ms and `isAllDay` as 0/1; these values are
 * assumptions until the owner checks a written row on the tablet (issue #28). Replace with a
 * descriptor rule if the device differs.
 */
export function eventToRow(d: Descriptor, e: DeviceEvent, now: number): Row {
  const col = (field: string) => column(d.calendar, 'events', field);
  return toCalendarInsert(d, {
    [col('calendarId')]: e.calendarId,
    [col('eventId')]: e.eventId,
    [col('title')]: e.title,
    [col('content')]: e.content,
    [col('start')]: e.start,
    [col('end')]: e.end,
    [col('allDay')]: e.allDay ? 1 : 0,
    [col('readOnly')]: 1,
    [col('modified')]: now,
  });
}

const requireId = (row: Row, key: string): string => {
  const v = row[key];
  if (v === null || v === undefined || v === '') throw new Error(`calendar row has no ${key}`);
  return String(v);
};

const requireTime = (row: Row, key: string): number => {
  const v = row[key];
  const n = v === null || v === undefined || v === '' ? NaN : Number(v);
  if (!Number.isFinite(n)) throw new Error(`calendar row has no usable ${key}`);
  return n;
};

/** Read a data_info row. A missing id or time throws: a made-up id would become a sync key (#70). */
export function rowToEvent(d: Descriptor, row: Row): DeviceEvent {
  const col = (field: string) => column(d.calendar, 'events', field);
  const allDay = row[col('allDay')];
  return {
    eventId: requireId(row, col('eventId')),
    calendarId: requireId(row, col('calendarId')),
    title: String(row[col('title')] ?? ''),
    content: String(row[col('content')] ?? ''),
    start: requireTime(row, col('start')),
    end: requireTime(row, col('end')),
    allDay: allDay === 1 || allDay === '1' || allDay === true,
  };
}
