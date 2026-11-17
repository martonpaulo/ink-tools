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

/** A pulled row's source: the calendar and event ids its `calendarId` text carries (#28). */
export interface CalendarLink {
  calendarId: string;
  eventId: string;
}

/**
 * The `calendarId` text of a pulled row: the descriptor's `linkPrefix`, then both ids, each
 * URI-encoded so the `:` between them never occurs inside one (Google ids can hold `#` and other signs).
 */
export function calendarLink(d: Descriptor, link: CalendarLink): string {
  return `${d.calendar.rules.linkPrefix}${encodeURIComponent(link.calendarId)}:${encodeURIComponent(link.eventId)}`;
}

/** The link a `calendarId` text carries, or null for any other text: a row made on the tablet. */
export function readCalendarLink(d: Descriptor, value: unknown): CalendarLink | null {
  const prefix = d.calendar.rules.linkPrefix;
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  const parts = value.slice(prefix.length).split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    return {calendarId: decodeURIComponent(parts[0]), eventId: decodeURIComponent(parts[1])};
  } catch {
    return null;
  }
}

/**
 * The data_info row for an event, in the shape of the rows the Calendar app showed (#28): `tag=task`,
 * `state` 0, `status` confirmed, `readOnly` 1, `isAllDay` 0 or 1, `startTime` and `endTime` in epoch
 * ms, `lastModifiedTime` in epoch ms, and `eventId` NULL, with the event's link in `calendarId`.
 * Account Sync beta 23 wrote the Google id in `eventId`, and the app hid all 217 of those rows while
 * it showed the «Account Sync dry insert» rows, whose `eventId` was NULL and whose other columns had
 * the same shape (#43). shortcut: that `eventId` is the filter is an inference from those rounds,
 * not read in the app's code; decompile `SupernoteCalendar.apk` if a linked row stays hidden.
 * Left NULL, as in the native timed row of #43: `isSelf`, `startDate`, `endDate` and the recurrence
 * columns (each occurrence is its own row). shortcut: an all-day row also leaves `startDate` and
 * `endDate` NULL, since no native all-day row was read; fill them if such a row shows them set.
 * `data_info` has no time zone column: times are absolute epoch ms.
 */
export function eventToRow(d: Descriptor, e: DeviceEvent, now: number): Row {
  const col = (field: string) => column(d.calendar, 'events', field);
  return toCalendarInsert(d, {
    [col('calendarId')]: calendarLink(d, e),
    [col('eventId')]: null,
    [col('title')]: e.title,
    [col('content')]: e.content,
    [col('start')]: e.start,
    [col('end')]: e.end,
    [col('allDay')]: e.allDay ? 1 : 0,
    [col('readOnly')]: 1,
    [col('modified')]: now,
  });
}

/**
 * The update that gives a row Account Sync beta 23 or older wrote its visible shape (#28): such a row
 * is `tag=task` with a non-empty `eventId`, which only Account Sync writes (the native Google sync
 * writes `tag=event`, a tablet-made event has no `eventId`). Null for any other row. The row is
 * updated in place by its id, never deleted and inserted again, so no event gets a second row.
 */
export function legacyRowRepair(d: Descriptor, row: Row): Row | null {
  const col = (field: string) => column(d.calendar, 'events', field);
  const eventId = row[col('eventId')];
  const calendarId = row[col('calendarId')];
  if (row[col('tag')] !== d.calendar.rules.writeTag) return null;
  if (eventId === null || eventId === undefined || eventId === '') return null;
  if (calendarId === null || calendarId === undefined || calendarId === '') return null;
  return {
    [col('calendarId')]: calendarLink(d, {calendarId: String(calendarId), eventId: String(eventId)}),
    [col('eventId')]: null,
  };
}

const requireLink = (d: Descriptor, row: Row): CalendarLink => {
  const key = column(d.calendar, 'events', 'calendarId');
  const link = readCalendarLink(d, row[key]);
  if (!link) throw new Error(`calendar row has no ${key} link`);
  return link;
};

const requireTime = (row: Row, key: string): number => {
  const v = row[key];
  const n = v === null || v === undefined || v === '' ? NaN : Number(v);
  if (!Number.isFinite(n)) throw new Error(`calendar row has no usable ${key}`);
  return n;
};

/** Read a pulled data_info row. A missing link or time throws: a made-up id would become a sync key (#70). */
export function rowToEvent(d: Descriptor, row: Row): DeviceEvent {
  return readEvent(d, row, requireLink(d, row));
}

function readEvent(d: Descriptor, row: Row, link: CalendarLink): DeviceEvent {
  const col = (field: string) => column(d.calendar, 'events', field);
  const allDay = row[col('allDay')];
  const changed = Number(row[col('modified')] ?? NaN);
  return {
    eventId: link.eventId,
    calendarId: link.calendarId,
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
 * Read one of our rows as an edit for the push (#29). A row with no link in `calendarId` is an event
 * made on the tablet, so it reads as an empty id, which the push creates in the default calendar; a
 * missing time still throws, as in `rowToEvent`.
 */
export function rowToDeviceEdit(d: Descriptor, row: Row): DeviceEventEdit {
  const col = (field: string) => column(d.calendar, 'events', field);
  const link = readCalendarLink(d, row[col('calendarId')]) ?? {calendarId: String(row[col('calendarId')] ?? ''), eventId: ''};
  return {event: readEvent(d, row, link), cancelled: row[col('status')] === d.calendar.rules.cancelledStatus};
}
