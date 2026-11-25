import {CalendarEvent, CalendarInfo, CalendarProvider, TimeWindow} from './calendar';
import {HttpFetch, requireHttps} from './http';

/**
 * ICS (RFC 5545) parsing with recurrence expansion, and the ICS-feed and CalDAV (iCloud) providers.
 * Supported RRULE: FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY (weekly only),
 * plus EXDATE and RECURRENCE-ID overrides. Any other RRULE part is reported by `occurrenceStarts`
 * as a warning and the event is kept as its first occurrence only; a TZID other than UTC is reported
 * by `parseIcs`. The providers hand every warning to their `onWarnings` option (#61).
 * shortcut: floating and TZID times read as UTC, no VTIMEZONE database; revisit with time zones.
 * Not yet run against a live feed or iCloud: the owner verifies it on the Mac (issue #30).
 */
export interface IcsEvent {
  uid: string;
  title: string;
  content: string;
  start: number;
  end: number;
  allDay: boolean;
  rrule?: Record<string, string>;
  exdates: number[];
  recurrenceId?: number;
  /** Only set on a RECURRENCE-ID override: that one occurrence is cancelled. */
  cancelled?: boolean;
}

const DAY = 86400000;

export function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}
const unescapeText = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

export function parseTime(params: string, value: string): {ms: number; allDay: boolean} {
  const allDay = /VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value);
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(value);
  if (!m) throw new Error(`bad date ${value}`);
  return {ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)), allDay};
}

export function parseIcs(text: string): {events: IcsEvent[]; warnings: string[]} {
  const events: IcsEvent[] = [];
  const warnings: string[] = [];
  let cur: (Partial<IcsEvent> & {dtend?: number; duration?: number}) | null = null;
  let cancelled = false;
  let inAlarm = false; // lines of a nested VALARM are the alarm's, never the event's (#68)
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {exdates: [], title: '', content: ''};
      cancelled = false;
      inAlarm = false;
    }
    else if (line === 'BEGIN:VALARM' && cur) inAlarm = true;
    else if (line === 'END:VALARM') inAlarm = false;
    else if (inAlarm) continue;
    else if (line === 'END:VEVENT' && cur) {
      if (cur.uid && cur.start !== undefined && (!cancelled || cur.recurrenceId !== undefined)) {
        const end = cur.dtend ?? cur.start + (cur.duration ?? (cur.allDay ? DAY : 0));
        // A cancelled master is dropped; a cancelled override is kept so its occurrence is skipped (#60).
        events.push({...(cur as IcsEvent), end, ...(cancelled ? {cancelled: true} : {})});
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const [name, ...p] = line.slice(0, i).split(';');
      const params = p.join(';');
      const value = line.slice(i + 1);
      try {
        switch (name.toUpperCase()) {
          case 'UID': cur.uid = value; break;
          case 'SUMMARY': cur.title = unescapeText(value); break;
          case 'DESCRIPTION': cur.content = unescapeText(value); break;
          case 'STATUS': cancelled = value.toUpperCase() === 'CANCELLED'; break;
          case 'DTSTART': {
            const t = parseTime(params, value);
            cur.start = t.ms;
            cur.allDay = t.allDay;
            const tz = /(?:^|;)TZID=([^;]+)/i.exec(params)?.[1];
            if (tz && !/^utc$/i.test(tz)) warnings.push(`${cur.uid ?? 'event'}: TZID ${tz} is read as UTC`);
            break;
          }
          case 'DTEND': cur.dtend = parseTime(params, value).ms; break;
          case 'DURATION': {
            const d = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
            if (d) cur.duration = (+(d[1] ?? 0) * 7 + +(d[2] ?? 0)) * DAY + +(d[3] ?? 0) * 3600000 + +(d[4] ?? 0) * 60000 + +(d[5] ?? 0) * 1000;
            break;
          }
          case 'EXDATE': for (const v of value.split(',')) cur.exdates!.push(parseTime(params, v).ms); break;
          case 'RECURRENCE-ID': cur.recurrenceId = parseTime(params, value).ms; break;
          case 'RRULE': cur.rrule = Object.fromEntries(value.split(';').map(kv => kv.split('=') as [string, string])); break;
        }
      } catch (e) {
        warnings.push(`${cur.uid ?? 'event'}: ${(e as Error).message}`);
      }
    }
  }
  return {events, warnings};
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function addMonths(ms: number, n: number): number | null {
  const d = new Date(ms);
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  return r.getUTCDate() === d.getUTCDate() ? r.getTime() : null; // a 31st skips short months, as RFC 5545 does
}

/** The RRULE parts each frequency expands; any other part is reported, never ignored (#61). */
const BASE_PARTS = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'WKST'];
const SUPPORTED_PARTS: Record<string, string[]> = {
  DAILY: BASE_PARTS,
  WEEKLY: [...BASE_PARTS, 'BYDAY'],
  MONTHLY: BASE_PARTS,
  YEARLY: BASE_PARTS,
};

/** Start times of every occurrence of `e` that begins before `to`. */
export function occurrenceStarts(e: IcsEvent, to: number, warnings: string[] = [], notBefore = -Infinity): number[] {
  const r = e.rrule;
  if (!r) return [e.start];
  const freq = r.FREQ;
  const unsupported = Object.keys(r).filter(k => !(SUPPORTED_PARTS[freq] ?? BASE_PARTS).includes(k));
  if (SUPPORTED_PARTS[freq] && unsupported.length) {
    warnings.push(`${e.uid}: unsupported ${freq} RRULE part ${unsupported.join(',')}`);
    return [e.start];
  }
  const interval = Math.max(1, Number(r.INTERVAL ?? 1));
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  let until = Infinity;
  if (r.UNTIL) {
    try {
      until = parseTime('', r.UNTIL).ms + (r.UNTIL.length === 8 ? DAY - 1 : 0);
    } catch {
      // A bad UNTIL must not abort the whole calendar (#79): keep the first occurrence and warn.
      warnings.push(`${e.uid}: bad RRULE UNTIL ${r.UNTIL}`);
      return [e.start];
    }
  }
  const limit = Math.min(to, until);
  const out: number[] = [];
  const push = (t: number) => {
    if (t >= e.start && t <= limit && out.length < count) out.push(t);
  };
  // Without COUNT, occurrences before `notBefore` need not be walked (#82); with COUNT the walk is bounded by it.
  const skipTo = (first: number, step: number) =>
    count === Infinity && notBefore > first ? first + Math.floor((notBefore - first) / step) * step : first;
  if (freq === 'DAILY') {
    for (let t = skipTo(e.start, interval * DAY); t <= limit && out.length < count; t += interval * DAY) push(t);
  } else if (freq === 'WEEKLY') {
    const days = r.BYDAY ? r.BYDAY.split(',').map(d => WEEKDAYS.indexOf(d.slice(-2))) : [new Date(e.start).getUTCDay()];
    if (days.includes(-1)) { warnings.push(`${e.uid}: unsupported BYDAY ${r.BYDAY}`); return [e.start]; }
    const weekStart = e.start - new Date(e.start).getUTCDay() * DAY;
    for (let w = skipTo(weekStart, interval * 7 * DAY); w <= limit && out.length < count; w += interval * 7 * DAY) {
      for (const d of [...days].sort((a, b) => a - b)) {
        const t = w + d * DAY;
        if (t >= e.start && out.length < count) push(t);
      }
    }
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const step = freq === 'YEARLY' ? 12 * interval : interval;
    for (let n = 0; ; n += step) {
      const t = addMonths(e.start, n);
      if (t !== null) { if (t > limit) break; push(t); }
      if (out.length >= count || n > 12 * 200) break;
    }
  } else {
    warnings.push(`${e.uid}: unsupported FREQ ${freq}`);
    return [e.start];
  }
  return out;
}

/** Expand parsed events into one CalendarEvent per occurrence overlapping the window. */
export function expandEvents(calendarId: string, events: IcsEvent[], w: TimeWindow, warnings: string[] = []): CalendarEvent[] {
  const overrides = new Map(events.filter(e => e.recurrenceId !== undefined).map(e => [`${e.uid}|${e.recurrenceId}`, e]));
  const out: CalendarEvent[] = [];
  for (const e of events) {
    if (e.recurrenceId !== undefined) continue;
    const len = e.end - e.start;
    for (const s of occurrenceStarts(e, w.to, warnings, w.from - len)) {
      if (e.exdates.includes(s)) continue;
      const o = overrides.get(`${e.uid}|${s}`) ?? e;
      if (o.cancelled) continue;
      const start = o === e ? s : o.start;
      const end = o === e ? s + len : o.end;
      // An end equal to the window start is outside it, except for a zero-length event (#62).
      if (end < w.from || (end === w.from && end > start) || start > w.to) continue;
      out.push({eventId: e.rrule ? `${e.uid}@${s}` : e.uid, calendarId, title: o.title, content: o.content, start, end, allDay: o.allDay ?? e.allDay});
    }
  }
  return out;
}

/** `webcal://` is the same address over HTTPS. */
export const httpsUrl = (u: string) => u.replace(/^webcal:\/\//i, 'https://');

export interface IcsFeed {
  /** Becomes the calendarId. */
  id: string;
  name: string;
  url: string;
}

/** Where a provider reports what it could not read exactly: unsupported rules and time zones (#61). */
export type WarningSink = (warnings: string[]) => void;

/**
 * Largest feed or CalDAV answer parsed, in characters (#82). Measured on the owner's iCloud on
 * 2026-11-25: a REPORT over Account Sync's 67-day window answers 107 characters per calendar with no
 * event, and one stored event costs 3,411 characters (its VTIMEZONE included). So 8 MiB holds about
 * 2,400 such events: 36 a day over the window, or an ICS feed of that many.
 */
export const MAX_ANSWER_CHARS = 8 * 1024 * 1024;

export function withinLimit(text: string, what: string): string {
  if (text.length > MAX_ANSWER_CHARS) throw new Error(`${what} is larger than ${MAX_ANSWER_CHARS} characters and was refused`);
  return text;
}

/** Read-only ICS subscriptions, one calendar per feed. */
export function createIcsProvider(
  fetchText: (url: string) => Promise<string>,
  feeds: IcsFeed[],
  onWarnings: WarningSink = () => {},
): CalendarProvider {
  return {
    listCalendars: async (): Promise<CalendarInfo[]> => feeds.map(f => ({calendarId: f.id, name: f.name})),
    async listEvents(calendarId, w) {
      const feed = feeds.find(f => f.id === calendarId);
      if (!feed) throw new Error(`unknown ICS feed ${calendarId}`);
      const {events, warnings} = parseIcs(withinLimit(await fetchText(requireHttps(httpsUrl(feed.url), 'ICS feed')), 'ICS feed'));
      const found = [...warnings];
      const out = expandEvents(calendarId, events, w, found);
      if (found.length) onWarnings(found);
      return out;
    },
  };
}

export interface CalDavOptions {
  fetch: HttpFetch<{text(): Promise<string>}>;
  /**
   * The calendar collections to read, e.g. found by PROPFIND on the owner's iCloud principal. An
   * iCloud subscribed calendar (resourcetype `subscribed`) answers a REPORT with no event, measured
   * 2026-11-25 (#82): read its source as an ICS feed instead.
   */
  calendars: IcsFeed[];
  username: string;
  /** Reads the app-specific password from the owner's secure store at call time; it is never in the repository. */
  getPassword: () => Promise<string>;
  /** Base64 of `username:password`; injected so the module stays free of platform globals. */
  basicAuth: (username: string, password: string) => string;
  /** Receives the warnings of each read, when there are any (#61). */
  onWarnings?: WarningSink;
}

const CALENDAR_DATA_OPEN = /<(?:\w+:)?calendar-data[^>]{0,200}>/g;
const CALENDAR_DATA_CLOSE = /<\/(?:\w+:)?calendar-data>/g;

/** The text of each `calendar-data` element, in one pass; an unclosed one is a warning, never a rescan (#82). */
export function calendarData(xml: string, warnings: string[] = []): string[] {
  const out: string[] = [];
  let at = 0;
  for (;;) {
    CALENDAR_DATA_OPEN.lastIndex = at;
    const open = CALENDAR_DATA_OPEN.exec(xml);
    if (!open) return out;
    const from = open.index + open[0].length;
    CALENDAR_DATA_CLOSE.lastIndex = from;
    const close = CALENDAR_DATA_CLOSE.exec(xml);
    if (!close) {
      warnings.push('CalDAV answer: a calendar-data element is not closed; the rest is skipped');
      return out;
    }
    out.push(xml.slice(from, close.index));
    at = close.index + close[0].length;
  }
}

/** The text of an XML element: CDATA unwrapped, the entities a CalDAV server escapes decoded. */
export const xmlText = (body: string) =>
  body.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

export const rfc5545 = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');

/** iCloud over CalDAV, read side: REPORT calendar-query, each `calendar-data` parsed as ICS. */
export function createCalDavProvider(o: CalDavOptions): CalendarProvider {
  return {
    listCalendars: async () => o.calendars.map(f => ({calendarId: f.id, name: f.name})),
    async listEvents(calendarId, w) {
      const cal = o.calendars.find(c => c.id === calendarId);
      if (!cal) throw new Error(`unknown CalDAV calendar ${calendarId}`);
      const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${rfc5545(w.from)}" end="${rfc5545(w.to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
      const res = await o.fetch(requireHttps(cal.url, 'CalDAV calendar'), {
        method: 'REPORT',
        headers: {Authorization: `Basic ${o.basicAuth(o.username, await o.getPassword())}`, Depth: '1', 'Content-Type': 'application/xml; charset=utf-8'},
        body,
      });
      if (!res.ok) throw new Error(`CalDAV REPORT failed with HTTP ${res.status}`);
      const xml = withinLimit(await res.text(), 'CalDAV answer');
      const events: IcsEvent[] = [];
      const warnings: string[] = [];
      for (const body of calendarData(xml, warnings)) {
        const parsed = parseIcs(xmlText(body));
        events.push(...parsed.events);
        warnings.push(...parsed.warnings);
      }
      const out = expandEvents(calendarId, events, w, warnings);
      if (warnings.length) o.onWarnings?.(warnings);
      return out;
    },
  };
}
