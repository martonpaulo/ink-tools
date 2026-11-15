/** Provider-agnostic one-way calendar sync: external calendars into the tablet's native Calendar. */

export interface CalendarInfo {
  calendarId: string;
  name: string;
}

/** One occurrence. A recurring event arrives already expanded, one entry per occurrence. */
export interface CalendarEvent {
  /** Unique per occurrence and stable across syncs. */
  eventId: string;
  calendarId: string;
  title: string;
  content: string;
  /** Epoch ms. For an all-day event, start of the first day and start of the day after the last. */
  start: number;
  end: number;
  allDay: boolean;
  /**
   * Epoch ms of the last change, when the side knows it: Google's `updated`, the tablet's
   * `lastModifiedTime`. ICS has none. It decides a change made on both sides (#87).
   */
  modified?: number;
}

export interface TimeWindow {
  from: number;
  to: number;
}

/** The seam to a calendar service. Google, iCloud (CalDAV) and ICS are separate implementations. */
export interface CalendarProvider {
  listCalendars(): Promise<CalendarInfo[]>;
  /** Occurrences that overlap the window, recurrences expanded, cancelled ones left out. */
  listEvents(calendarId: string, window: TimeWindow): Promise<CalendarEvent[]>;
}

/** The tablet's Calendar, narrowed to the rows this plugin wrote (tag=task). */
export interface DeviceCalendarStore {
  listOurs(window: TimeWindow): Promise<CalendarEvent[]>;
  create(event: CalendarEvent): Promise<void>;
  update(event: CalendarEvent): Promise<void>;
  remove(calendarId: string, eventId: string): Promise<void>;
}

export interface CalendarSyncResult {
  created: number;
  updated: number;
  removed: number;
  errors: string[];
}

const key = (e: Pick<CalendarEvent, 'calendarId' | 'eventId'>) => `${e.calendarId}\u0000${e.eventId}`;
const same = (a: CalendarEvent, b: CalendarEvent) =>
  a.title === b.title && a.content === b.content && a.start === b.start && a.end === b.end && a.allDay === b.allDay;

/**
 * Make the device match the provider over `window`: add what is missing, update what differs,
 * remove our rows the provider no longer has. Rows outside the window and rows we did not write
 * are never touched. A calendar that fails to read keeps its rows and is reported.
 */
export async function syncCalendar(
  provider: CalendarProvider,
  store: DeviceCalendarStore,
  window: TimeWindow,
  enabledCalendarIds?: string[],
): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {created: 0, updated: 0, removed: 0, errors: []};
  const calendars = (await provider.listCalendars()).filter(
    c => !enabledCalendarIds || enabledCalendarIds.includes(c.calendarId),
  );
  const wanted = new Map<string, CalendarEvent>();
  const failed = new Set<string>();
  for (const cal of calendars) {
    try {
      for (const e of await provider.listEvents(cal.calendarId, window)) wanted.set(key(e), e);
    } catch (e) {
      failed.add(cal.calendarId);
      result.errors.push(`${cal.name}: ${(e as Error).message}`);
    }
  }
  const have = new Map((await store.listOurs(window)).map(e => [key(e), e]));
  const run = async (what: string, fn: () => Promise<void>, count: 'created' | 'updated' | 'removed') => {
    try {
      await fn();
      result[count]++;
    } catch (e) {
      result.errors.push(`${what}: ${(e as Error).message}`);
    }
  };
  for (const [k, e] of wanted) {
    const old = have.get(k);
    if (!old) await run(`create ${e.title}`, () => store.create(e), 'created');
    else if (!same(old, e)) await run(`update ${e.title}`, () => store.update(e), 'updated');
  }
  for (const [k, e] of have) {
    // A row of a disabled or unreadable calendar is left alone; removing it is the owner's button (cleanup.ts, #89).
    if (!wanted.has(k) && calendars.some(c => c.calendarId === e.calendarId) && !failed.has(e.calendarId)) {
      await run(`remove ${e.title}`, () => store.remove(e.calendarId, e.eventId), 'removed');
    }
  }
  return result;
}
