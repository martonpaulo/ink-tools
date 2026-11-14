import {Descriptor} from './descriptor';
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
  return toCalendarInsert(d, {
    calendarId: e.calendarId,
    eventId: e.eventId,
    title: e.title,
    content: e.content,
    startTime: e.start,
    endTime: e.end,
    isAllDay: e.allDay ? 1 : 0,
    readOnly: 1,
    lastModifiedTime: now,
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
export function rowToEvent(row: Row): DeviceEvent {
  return {
    eventId: requireId(row, 'eventId'),
    calendarId: requireId(row, 'calendarId'),
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    start: requireTime(row, 'startTime'),
    end: requireTime(row, 'endTime'),
    allDay: row.isAllDay === 1 || row.isAllDay === '1' || row.isAllDay === true,
  };
}
