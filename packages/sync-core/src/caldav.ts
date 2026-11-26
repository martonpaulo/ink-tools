import {CalendarEvent} from './calendar';
import {HttpFetch, requireHttps} from './http';
import {CALDAV_ANSWER, CALDAV_XML, CalDavOptions, IcsFeed, basicHeader, calendarData, parseTime, rfc5545, unfold, withinLimit, xmlText} from './ics';
import {CalendarWriter} from './push';
import services from './services.json';

/** Where iCloud's CalDAV discovery starts; `services.json` owns the address. */
export const ICLOUD_CALDAV_ROOT: string = services.icloudCalDav;

/**
 * iCloud over CalDAV, write side (#30): the `CalendarWriter` the two-way push of #29 drives.
 * Each write first finds the event's resource by its UID (REPORT with a UID prop-filter, RFC 4791
 * §7.8.6), then changes only the lines it owns and writes the resource back with `If-Match`, so an
 * alarm, a location or an attendee the tablet never saw is kept, and a change made on iCloud in
 * between fails the write instead of being overwritten.
 * An expanded occurrence (`<uid>@<start ms>`, as `expandEvents` names it) is written as a
 * RECURRENCE-ID override, and deleted as an EXDATE: never a change to the whole series.
 * shortcut: times are written in the form of the event's own DTSTART, TZID kept and its digits read
 * as UTC, the same reading as `parseIcs`; revisit with time zones.
 * Not yet run against iCloud: the owner's live check of #30.
 */
export interface CalDavWriterOptions extends Omit<CalDavOptions, 'fetch' | 'onWarnings'> {
  fetch: HttpFetch<{text(): Promise<string>}>;
  /** A new, unique UID for an event made on the tablet; injected so tests stay deterministic. */
  newUid: () => string;
  /** Epoch ms, for DTSTAMP. */
  now: () => number;
}

/** One event resource on the server. */
export interface CalDavResource {
  url: string;
  etag: string;
  ics: string;
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const FOLD_OCTETS = 75;
const utf8Length = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
};

/** RFC 5545 §3.1: lines longer than 75 octets continue on a line that starts with a space. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let octets = 0;
  for (const ch of line) {
    const n = utf8Length(ch);
    // A continuation line's leading space counts toward its 75 octets.
    if (octets + n > FOLD_OCTETS) {
      out.push(cur);
      cur = ' ';
      octets = 1;
    }
    cur += ch;
    octets += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const serialize = (lines: string[]) => lines.map(foldLine).join('\r\n') + '\r\n';

/** How a time is written: a date, a TZID local time, a floating time or UTC. */
interface TimeForm {
  date: boolean;
  tzid?: string;
  utc: boolean;
}

const UTC_FORM: TimeForm = {date: false, utc: true};

function formOf(line: string | undefined): TimeForm {
  if (!line) return UTC_FORM;
  const i = line.indexOf(':');
  const params = line.slice(0, i);
  const value = line.slice(i + 1);
  const tzid = /;TZID=([^;:]+)/i.exec(params)?.[1];
  return {date: /VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(value), ...(tzid ? {tzid} : {}), utc: /Z$/i.test(value)};
}

function timeLine(name: string, ms: number, form: TimeForm): string {
  const digits = rfc5545(ms);
  if (form.date) return `${name};VALUE=DATE:${digits.slice(0, 8)}`;
  if (form.tzid) return `${name};TZID=${form.tzid}:${digits.replace(/Z$/, '')}`;
  return `${name}:${form.utc ? digits : digits.replace(/Z$/, '')}`;
}

/** The form an event's own times take: a date for an all-day event, else the series' time form. */
const eventForm = (allDay: boolean, series: TimeForm): TimeForm =>
  allDay ? {date: true, utc: false} : series.date ? UTC_FORM : series;

const propName = (line: string) => line.slice(0, Math.max(0, line.search(/[;:]/))).toUpperCase();

/** One VEVENT block: where it sits in the unfolded lines. */
interface Block {
  from: number;
  to: number;
  recurrenceId?: number;
  rrule: boolean;
}

function vevents(lines: string[]): Block[] {
  const out: Block[] = [];
  let open = -1;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'BEGIN:VEVENT') open = i;
    else if (open >= 0 && /^BEGIN:/.test(lines[i])) depth++;
    else if (open >= 0 && depth > 0 && /^END:/.test(lines[i])) depth--;
    else if (open >= 0 && lines[i] === 'END:VEVENT') {
      const own = lines.slice(open, i + 1);
      const rid = own.find(l => propName(l) === 'RECURRENCE-ID');
      const c = rid ? rid.indexOf(':') : -1;
      out.push({
        from: open,
        to: i,
        ...(rid ? {recurrenceId: parseTime(rid.slice(0, c), rid.slice(c + 1)).ms} : {}),
        rrule: own.some(l => propName(l) === 'RRULE'),
      });
      open = -1;
    }
  }
  return out;
}

/** The lines of one event's content: the props Bridge owns, in the event's time form. */
function contentLines(e: CalendarEvent, form: TimeForm): string[] {
  return [
    timeLine('DTSTART', e.start, form),
    timeLine('DTEND', e.end, form),
    `SUMMARY:${escapeText(e.title)}`,
    `DESCRIPTION:${escapeText(e.content)}`,
  ];
}

const OWNED = new Set(['DTSTART', 'DTEND', 'DURATION', 'SUMMARY', 'DESCRIPTION', 'DTSTAMP', 'LAST-MODIFIED', 'SEQUENCE']);

/** Replace the owned props of the block at `b`, keeping every other line, nested alarms included. */
function rewriteBlock(lines: string[], b: Block, e: CalendarEvent, stamp: string): string[] {
  const own = lines.slice(b.from + 1, b.to);
  const series = formOf(own.find(l => propName(l) === 'DTSTART'));
  const seq = Number(/^SEQUENCE:(\d+)$/i.exec(own.find(l => propName(l) === 'SEQUENCE') ?? '')?.[1] ?? 0);
  let depth = 0;
  const kept = own.filter(l => {
    if (/^BEGIN:/.test(l)) depth++;
    else if (/^END:/.test(l)) depth--;
    return depth > 0 || /^END:/.test(l) || !OWNED.has(propName(l));
  });
  const body = [...contentLines(e, eventForm(e.allDay, series)), stamp, `SEQUENCE:${seq + 1}`, ...kept];
  return [...lines.slice(0, b.from + 1), ...body, ...lines.slice(b.to)];
}

/** `uid@<start ms>` names an expanded occurrence; the UID itself may also hold an `@`. */
const OCCURRENCE = /^(.*)@(-?\d+)$/;

export function createCalDavWriter(o: CalDavWriterOptions): CalendarWriter {
  const collection = (calendarId: string) => {
    const cal = o.calendars.find(c => c.id === calendarId);
    if (!cal) throw new Error(`unknown CalDAV calendar ${calendarId}`);
    const url = requireHttps(cal.url, 'CalDAV calendar');
    return url.endsWith('/') ? url : `${url}/`;
  };
  const auth = () => basicHeader(o);
  const stamp = () => `DTSTAMP:${rfc5545(o.now())}`;

  const send = async (method: string, url: string, headers: Record<string, string>, body?: string) =>
    o.fetch(url, {method, headers: {Authorization: await auth(), ...headers}, ...(body === undefined ? {} : {body})});

  /** The resource that holds `uid`, or null when the server has none. */
  async function find(calendarId: string, uid: string): Promise<CalDavResource | null> {
    const base = collection(calendarId);
    const query = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:prop-filter name="UID"><c:text-match collation="i;octet">${escapeXml(uid)}</c:text-match></c:prop-filter></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
    const res = await send('REPORT', base, {Depth: '1', 'Content-Type': CALDAV_XML}, query);
    if (!res.ok) throw new Error(`CalDAV REPORT failed with HTTP ${res.status}`);
    const xml = withinLimit(await res.text(), CALDAV_ANSWER);
    const href = /<(?:\w+:)?href>([^<]{1,2000})<\/(?:\w+:)?href>/.exec(xml)?.[1];
    const etag = /<(?:\w+:)?getetag>([^<]{1,200})<\/(?:\w+:)?getetag>/.exec(xml)?.[1];
    const data = calendarData(xml)[0];
    if (!href || data === undefined) return null;
    if (!etag) throw new Error('CalDAV answer has no ETag, so the event cannot be changed safely');
    const path = xmlText(href.trim());
    const url = /^https:\/\//i.test(path) ? path : `${/^https:\/\/[^/]+/i.exec(base)![0]}${path.startsWith('/') ? '' : '/'}${path}`;
    return {url, etag: xmlText(etag.trim()), ics: xmlText(data)};
  }

  /** The series and the occurrence start for an occurrence id, else the plain event. */
  async function resolve(calendarId: string, eventId: string): Promise<{res: CalDavResource | null; occurrence?: number}> {
    const m = OCCURRENCE.exec(eventId);
    if (m) {
      const series = await find(calendarId, m[1]);
      if (series && vevents(unfold(series.ics)).some(b => b.rrule)) return {res: series, occurrence: Number(m[2])};
    }
    return {res: await find(calendarId, eventId)};
  }

  const put = async (r: CalDavResource, lines: string[]) => {
    const res = await send('PUT', r.url, {'Content-Type': 'text/calendar; charset=utf-8', 'If-Match': r.etag}, serialize(lines));
    if (res.status === 412) throw new Error('the event changed on iCloud since it was read; the next sync reads it again');
    if (!res.ok) throw new Error(`CalDAV PUT failed with HTTP ${res.status}`);
  };

  const master = (lines: string[]) => {
    const b = vevents(lines).find(v => v.recurrenceId === undefined);
    if (!b) throw new Error('the CalDAV resource has no main VEVENT');
    return b;
  };

  return {
    async createEvent(calendarId, event) {
      const uid = o.newUid();
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ink-tools//Account Sync//EN', 'BEGIN:VEVENT', `UID:${uid}`, stamp(),
        ...contentLines(event, eventForm(event.allDay, UTC_FORM)), 'END:VEVENT', 'END:VCALENDAR'];
      const url = `${collection(calendarId)}${encodeURIComponent(uid)}.ics`;
      // If-None-Match: never overwrite a resource that already has this name.
      const res = await send('PUT', url, {'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*'}, serialize(lines));
      if (!res.ok) throw new Error(`CalDAV PUT failed with HTTP ${res.status}`);
      return uid;
    },

    async updateEvent(event) {
      const {res, occurrence} = await resolve(event.calendarId, event.eventId);
      if (!res) throw new Error(`event ${event.eventId} is not on iCloud`);
      const lines = unfold(res.ics).filter(l => l !== '');
      if (occurrence === undefined) return put(res, rewriteBlock(lines, master(lines), event, stamp()));
      const override = vevents(lines).find(b => b.recurrenceId === occurrence);
      if (override) return put(res, rewriteBlock(lines, override, event, stamp()));
      const m = master(lines);
      const series = formOf(lines.slice(m.from, m.to).find(l => propName(l) === 'DTSTART'));
      const uid = lines.slice(m.from, m.to).find(l => propName(l) === 'UID')!;
      const added = ['BEGIN:VEVENT', uid, timeLine('RECURRENCE-ID', occurrence, series), stamp(),
        ...contentLines(event, eventForm(event.allDay, series)), 'END:VEVENT'];
      return put(res, [...lines.slice(0, m.to + 1), ...added, ...lines.slice(m.to + 1)]);
    },

    async deleteEvent(calendarId, eventId) {
      const {res, occurrence} = await resolve(calendarId, eventId);
      if (!res) return; // already gone: the wanted end state
      if (occurrence === undefined) {
        const gone = await send('DELETE', res.url, {'If-Match': res.etag});
        if (gone.status === 412) throw new Error('the event changed on iCloud since it was read; the next sync reads it again');
        if (!gone.ok && gone.status !== 404 && gone.status !== 410) throw new Error(`CalDAV DELETE failed with HTTP ${gone.status}`);
        return;
      }
      let lines = unfold(res.ics).filter(l => l !== '');
      const override = vevents(lines).find(b => b.recurrenceId === occurrence);
      if (override) lines = [...lines.slice(0, override.from), ...lines.slice(override.to + 1)];
      const m = master(lines);
      const series = formOf(lines.slice(m.from, m.to).find(l => propName(l) === 'DTSTART'));
      return put(res, [...lines.slice(0, m.to), timeLine('EXDATE', occurrence, series), ...lines.slice(m.to)]);
    },
  };
}

/** The status a server answers a refused sign-in with (RFC 9110 §15.5.2). */
const HTTP_UNAUTHORIZED = 401;

/** What CalDAV discovery needs: the server's root, and the same sign-in as a read. */
export interface CalDavDiscoveryOptions extends Pick<CalDavOptions, 'username' | 'getPassword' | 'basicAuth'> {
  fetch: HttpFetch<{text(): Promise<string>}>;
  /** Where discovery starts, such as `services.json`'s `icloudCalDav`. */
  root: string;
}

/** One `<response>` of a multistatus answer: its href and the inner XML of its 200 propstat. */
interface DavResponse {
  href: string;
  props: string;
}

const RESPONSE = /<(?:\w+:)?response[\s>][\s\S]*?<\/(?:\w+:)?response>/g;
const tagged = (name: string) => new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]{0,200})?>([\\s\\S]*?)</(?:\\w+:)?${name}>`);
const HREF = tagged('href');

function davResponses(xml: string): DavResponse[] {
  return [...xml.matchAll(RESPONSE)].map(([block]) => {
    // Only a propstat whose status is 200 holds props the server has; a 404 one lists the missing.
    const ok = [...block.matchAll(/<(?:\w+:)?propstat[\s>][\s\S]*?<\/(?:\w+:)?propstat>/g)]
      .map(m => m[0])
      .filter(p => / 200 /.test(tagged('status').exec(p)?.[1] ?? ' 200 '));
    return {href: xmlText((HREF.exec(block)?.[1] ?? '').trim()), props: ok.join('')};
  });
}

/** An href made absolute against the URL it answered, as RFC 4918 §8.3 allows either. */
function absolute(href: string, base: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const origin = /^https:\/\/[^/]+/i.exec(base)![0];
  return `${origin}${href.startsWith('/') ? '' : '/'}${href}`;
}

/** The href inside a property, such as `current-user-principal` or `calendar-home-set`. */
const hrefIn = (props: string, name: string): string | null => {
  const inner = tagged(name).exec(props)?.[1];
  const href = inner ? HREF.exec(inner)?.[1] : undefined;
  return href ? xmlText(href.trim()) : null;
};

/**
 * The owner's event calendars on a CalDAV server (#30), as RFC 6764 §6 and RFC 4791 §6.2.1 find
 * them: PROPFIND the root for `current-user-principal`, the principal for `calendar-home-set`, then
 * the home at depth 1. A collection is kept when its resourcetype is `calendar` and its component
 * set, when it names one, holds VEVENT; so iCloud's Reminders lists (VTODO only), the scheduling
 * inbox and outbox, and a subscribed calendar (resourcetype `subscribed`, read as an ICS feed
 * instead, #82) are left out. Each calendar's id is its collection URL, unique across sources.
 * Not yet run against iCloud: the owner's live check of #30.
 */
export async function discoverCalDavCalendars(o: CalDavDiscoveryOptions): Promise<IcsFeed[]> {
  const auth = await basicHeader(o);
  const propfind = async (url: string, depth: '0' | '1', props: string): Promise<DavResponse[]> => {
    const body = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${props}</d:prop></d:propfind>`;
    const res = await o.fetch(requireHttps(url, 'CalDAV server'), {
      method: 'PROPFIND',
      headers: {Authorization: auth, Depth: depth, 'Content-Type': CALDAV_XML},
      body,
    });
    if (res.status === HTTP_UNAUTHORIZED) throw new Error('CalDAV refused the sign-in (HTTP 401): check the Apple ID and the app-specific password');
    if (!res.ok) throw new Error(`CalDAV PROPFIND failed with HTTP ${res.status}`);
    return davResponses(withinLimit(await res.text(), CALDAV_ANSWER));
  };
  const one = async (url: string, name: string, props: string) => {
    for (const r of await propfind(url, '0', props)) {
      const href = hrefIn(r.props, name);
      if (href) return absolute(href, url);
    }
    throw new Error(`CalDAV answer has no ${name}`);
  };
  const principal = await one(o.root, 'current-user-principal', '<d:current-user-principal/>');
  const home = await one(principal, 'calendar-home-set', '<c:calendar-home-set/>');
  const found = await propfind(home, '1', '<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/>');
  const out: IcsFeed[] = [];
  for (const r of found) {
    const type = tagged('resourcetype').exec(r.props)?.[1] ?? '';
    if (!/<(?:\w+:)?calendar[\s/>]/.test(type)) continue;
    const comps = tagged('supported-calendar-component-set').exec(r.props)?.[1];
    if (comps !== undefined && !/name="VEVENT"/i.test(comps)) continue;
    const url = absolute(r.href, home);
    const name = xmlText((tagged('displayname').exec(r.props)?.[1] ?? '').trim()) || url;
    out.push({id: url, name, url});
  }
  return out;
}
