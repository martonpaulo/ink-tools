import {CalendarEvent} from './calendar';
import {HttpFetch} from './http';

/**
 * Two-way half of the calendar module (#29): carry edits made on the tablet back to the source.
 * Run the push BEFORE the one-way pull, or the pull overwrites the edit. Writes only to sources
 * that accept them (Google, iCloud); ICS has no writer and is never pushed to.
 *
 * Changed on both sides since the last pull (#87, owner D14 A): the later `modified` wins, as for
 * To-Do; a tie, or a side that does not know its time, goes to the source. The losing version is
 * kept in `conflicts`, which the sync status shows and the log records.
 */

/** A source that accepts writes. `createEvent` returns the new event's id. */
export interface CalendarWriter {
  createEvent(calendarId: string, event: CalendarEvent): Promise<string>;
  /** On an expanded occurrence's id this is a single-occurrence override, not a series change. */
  updateEvent(event: CalendarEvent): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/** One row of ours the tablet changed. `eventId` is empty for an event created on the tablet. */
export interface DeviceEdit {
  event: CalendarEvent;
  /** The native app hides (status=cancelled) instead of deleting: that is the delete signal. */
  cancelled: boolean;
}

/** An event changed on the tablet and at the source between two syncs; `lost` is the version dropped. */
export interface Conflict {
  kept: 'tablet' | 'source';
  lost: CalendarEvent;
}

export interface PushResult {
  /** `calendarId` is the calendar that received the event; apply the pairs with `applyCreated`. */
  created: Array<{from: CalendarEvent; calendarId: string; eventId: string}>;
  updated: number;
  deleted: number;
  skipped: number;
  /** Edits made on both sides, and which version was kept (#87). */
  conflicts: Conflict[];
  errors: string[];
}

const key = (e: Pick<CalendarEvent, 'calendarId' | 'eventId'>) => `${e.calendarId}\u0000${e.eventId}`;
const same = (a: CalendarEvent, b: CalendarEvent) =>
  a.title === b.title && a.content === b.content && a.start === b.start && a.end === b.end && a.allDay === b.allDay;

/**
 * `baseline` is what the last pull wrote, so an edit identical to it is not pushed again.
 * `defaultCalendarId` receives tablet-created events; without it they are reported, not dropped.
 * `remote` is the source's events as read now; without it no change on the source side is seen.
 */
export async function pushCalendarEdits(
  edits: DeviceEdit[],
  baseline: CalendarEvent[],
  writer: CalendarWriter,
  defaultCalendarId?: string,
  remote: CalendarEvent[] = [],
): Promise<PushResult> {
  const result: PushResult = {created: [], updated: 0, deleted: 0, skipped: 0, conflicts: [], errors: []};
  const known = new Map(baseline.map(e => [key(e), e]));
  const now = new Map(remote.map(e => [key(e), e]));
  for (const {event, cancelled} of edits) {
    try {
      const base = event.eventId ? known.get(key(event)) : undefined;
      const source = event.eventId ? now.get(key(event)) : undefined;
      const tabletChanged = cancelled || !base || !same(base, event);
      if (base && source && tabletChanged && !same(base, source)) {
        const tabletWins = (event.modified ?? 0) > (source.modified ?? Infinity);
        result.conflicts.push(tabletWins ? {kept: 'tablet', lost: source} : {kept: 'source', lost: event});
        if (!tabletWins) {
          result.skipped++; // the pull then writes the source's version over the tablet's
          continue;
        }
      }
      if (!event.eventId) {
        if (cancelled) {
          result.skipped++;
        } else if (!defaultCalendarId) {
          result.errors.push(`"${event.title}": no default calendar chosen, event not created`);
        } else {
          result.created.push({from: event, calendarId: defaultCalendarId, eventId: await writer.createEvent(defaultCalendarId, event)});
        }
      } else if (cancelled) {
        await writer.deleteEvent(event.calendarId, event.eventId);
        result.deleted++;
      } else if (known.has(key(event)) && same(known.get(key(event))!, event)) {
        result.skipped++;
      } else {
        await writer.updateEvent(event);
        result.updated++;
      }
    } catch (e) {
      result.errors.push(`${event.calendarId}/${event.eventId || event.title}: ${(e as Error).message}`);
    }
  }
  return result;
}

const SIDE = {tablet: "the tablet's", source: "the source's"} as const;

/**
 * One line per conflict for the module's run record (`calendarRun`'s warnings, #88), so Settings and
 * the log keep the losing version's text: its title, start and notes (#87).
 */
export function conflictWarnings(conflicts: Conflict[]): string[] {
  return conflicts.map(({kept, lost}) => {
    const other = kept === 'tablet' ? 'source' : 'tablet';
    const notes = lost.content ? `, notes "${lost.content}"` : '';
    return `Changed on both sides: kept ${SIDE[kept]} version; ${SIDE[other]} was "${lost.title}" at ${new Date(lost.start).toISOString()}${notes}`;
  });
}

/** The tablet side of giving a tablet-created row its identity on the service. */
export interface DeviceRelinker {
  relink(from: CalendarEvent, to: {calendarId: string; eventId: string}): Promise<void>;
}

/**
 * Give each tablet-created row the id the service assigned. Run it after the push and before the
 * next pull, or the pull sees the new remote event as missing and writes it a second time (#65).
 * A row that fails to relink is reported and stays unlinked; it is retried never silently dropped.
 */
export async function applyCreated(result: PushResult, store: DeviceRelinker): Promise<string[]> {
  const errors: string[] = [];
  for (const {from, calendarId, eventId} of result.created) {
    try {
      await store.relink(from, {calendarId, eventId});
    } catch (e) {
      errors.push(`relink "${from.title}" to ${calendarId}/${eventId}: ${(e as Error).message}`);
    }
  }
  return errors;
}

export const GOOGLE_CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** shortcut: an all-day date writes as UTC, the same reading fromGoogleEvent uses; revisit with time zones. */
export function toGoogleBody(e: CalendarEvent): Record<string, unknown> {
  const when = (ms: number) => (e.allDay ? {date: day(ms)} : {dateTime: new Date(ms).toISOString()});
  return {summary: e.title, description: e.content, start: when(e.start), end: when(e.end)};
}

export function createGoogleCalendarWriter(fetch: HttpFetch, getAccessToken: () => Promise<string>): CalendarWriter {
  const call = async (method: string, calendarId: string, eventId: string, body?: unknown) => {
    const path = `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: {Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    // Deleting what is already gone (404, 410) is the wanted end state.
    if (!res.ok && !(method === 'DELETE' && (res.status === 404 || res.status === 410))) {
      throw new Error(`Google Calendar ${method} failed with HTTP ${res.status}`);
    }
    return res;
  };
  return {
    async createEvent(calendarId, event) {
      const id = ((await (await call('POST', calendarId, '', toGoogleBody(event))).json()) as {id?: string}).id;
      if (!id) throw new Error('Google Calendar create returned no event id');
      return id;
    },
    async updateEvent(event) {
      await call('PATCH', event.calendarId, event.eventId, toGoogleBody(event));
    },
    async deleteEvent(calendarId, eventId) {
      await call('DELETE', calendarId, eventId);
    },
  };
}
