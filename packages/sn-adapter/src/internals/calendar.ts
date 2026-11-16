import {Descriptor, column} from './descriptorModel';
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
  /** Epoch ms of the row's last change (`lastModifiedTime`), when the row has one (#87). */
  modified?: number;
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
  return readEvent(d, row, requireId(row, column(d.calendar, 'events', 'eventId')));
}

function readEvent(d: Descriptor, row: Row, eventId: string): DeviceEvent {
  const col = (field: string) => column(d.calendar, 'events', field);
  const allDay = row[col('allDay')];
  const changed = Number(row[col('modified')] ?? NaN);
  return {
    eventId,
    calendarId: requireId(row, col('calendarId')),
    title: String(row[col('title')] ?? ''),
    content: String(row[col('content')] ?? ''),
    start: requireTime(row, col('start')),
    end: requireTime(row, col('end')),
    allDay: allDay === 1 || allDay === '1' || allDay === true,
    ...(Number.isFinite(changed) && changed > 0 ? {modified: changed} : {}),
  };
}

/** Structurally the same shape as sync-core's DeviceEdit (#29). */
export interface DeviceEventEdit {
  event: DeviceEvent;
  /** The native app hides an event (`status` = the descriptor's `cancelledStatus`) instead of deleting it. */
  cancelled: boolean;
}

/**
 * Read one of our rows as an edit for the push (#29). A row with no `eventId` is an event made on the
 * tablet, so it reads as an empty id, which the push creates in the default calendar; a missing time
 * still throws, as in `rowToEvent`.
 */
export function rowToDeviceEdit(d: Descriptor, row: Row): DeviceEventEdit {
  const col = (field: string) => column(d.calendar, 'events', field);
  const id = row[col('eventId')];
  const event = id === null || id === undefined || id === '' ? readEvent(d, row, '') : rowToEvent(d, row);
  return {event, cancelled: row[col('status')] === d.calendar.rules.cancelledStatus};
}
