import {CalendarEvent, CalendarInfo, CalendarProvider, TimeWindow} from './calendar';
import {bearer, HttpFetch} from './http';
import services from './services.json';

/**
 * Google Calendar as a CalendarProvider (Calendar API v3) and the access-token refresh. The sign-in
 * runs on the Mac, not here: Google's device-code flow allows no Calendar scope (#64, #124).
 * `fetch` is injected, so tests need no network. Tokens live only in the owner's secure store.
 * Not yet run against a live account: the owner verifies it on the Mac (issue #28).
 */
// services.json owns every Todoist and Google address and scope; inkctl reads the same file (#295, #297).
const OAUTH_ENDPOINT = services.googleTokenEndpoint;
export const GOOGLE_CALENDAR_SCOPE = services.googleScopes.read;

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const FORM = {'Content-Type': 'application/x-www-form-urlencoded'};

/**
 * Google refused the stored refresh token: it was revoked, or it expired (seven days for a token
 * issued while the app was in Testing, #64; none now it is published, #372). Settings shows
 * Google as signed out, never an empty calendar.
 */
export class GoogleSignedOutError extends Error {
  constructor() {
    super('Google sign-in was revoked or has expired: sign in again on the Mac with inkctl google login');
    this.name = 'GoogleSignedOutError';
  }
}

/** The only Google token call the plugin makes; the sign-in itself runs on the Mac (owner D39 A, #124). */
export async function refreshAccessToken(fetch: HttpFetch, client: OAuthClient, refreshToken: string): Promise<string> {
  const res = await fetch(OAUTH_ENDPOINT, {
    method: 'POST',
    headers: FORM,
    body: form({client_id: client.clientId, client_secret: client.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token'}),
  });
  const j = (await res.json()) as {access_token?: string; error?: string};
  // RFC 6749 §5.2: a revoked or expired refresh token answers invalid_grant.
  if (j.error === 'invalid_grant') throw new GoogleSignedOutError();
  if (!res.ok || !j.access_token) throw new Error(`Google token refresh failed with HTTP ${res.status}`);
  return j.access_token;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: {date?: string; dateTime?: string};
  end?: {date?: string; dateTime?: string};
  /** RFC 3339 time of the last change to the event. */
  updated?: string;
}

/** shortcut: an all-day date reads as UTC midnight, not the tablet's zone; revisit with time zones. */
export function fromGoogleEvent(calendarId: string, e: GoogleEvent): CalendarEvent | null {
  if (e.status === 'cancelled' || !e.start || !e.end) return null;
  const allDay = !e.start.dateTime;
  const start = Date.parse(e.start.dateTime ?? `${e.start.date}T00:00:00Z`);
  const end = Date.parse(e.end.dateTime ?? `${e.end.date}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const modified = e.updated ? Date.parse(e.updated) : NaN;
  return {
    eventId: e.id, calendarId, title: e.summary ?? '(no title)', content: e.description ?? '', start, end, allDay,
    ...(Number.isNaN(modified) ? {} : {modified}),
  };
}

/**
 * The account the sign-in belongs to (#433): the primary calendar's id is the account's email, and
 * `calendar.readonly` reads it, so no new scope. A failed read throws with the HTTP status only.
 */
export async function fetchGoogleAccount(fetch: HttpFetch, getAccessToken: () => Promise<string>): Promise<string> {
  const res = await fetch(`${services.googleCalendarApi}/calendars/primary`, {
    method: 'GET',
    headers: {Authorization: await bearer(getAccessToken)},
  });
  if (!res.ok) throw new Error(`Google Calendar GET /calendars/primary failed with HTTP ${res.status}`);
  const id = ((await res.json()) as {id?: unknown} | null)?.id;
  if (typeof id !== 'string' || !id.trim()) throw new Error('Google Calendar GET /calendars/primary answered with no id');
  return id.trim();
}

/** `getAccessToken` is called per request so a refreshed token is always used. */
export function createGoogleCalendarProvider(fetch: HttpFetch, getAccessToken: () => Promise<string>): CalendarProvider {
  const get = async (path: string): Promise<any> => {
    const res = await fetch(`${services.googleCalendarApi}${path}`, {
      method: 'GET',
      headers: {Authorization: await bearer(getAccessToken)},
    });
    if (!res.ok) throw new Error(`Google Calendar GET ${path.split('?')[0]} failed with HTTP ${res.status}`);
    return res.json();
  };
  return {
    async listCalendars(): Promise<CalendarInfo[]> {
      const out: CalendarInfo[] = [];
      let token = '';
      do {
        const page = await get(`/users/me/calendarList?minAccessRole=reader${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
        for (const c of page.items ?? []) out.push({calendarId: c.id, name: c.summaryOverride ?? c.summary ?? c.id});
        token = page.nextPageToken ?? '';
      } while (token);
      return out;
    },
    async listEvents(calendarId: string, w: TimeWindow): Promise<CalendarEvent[]> {
      const out: CalendarEvent[] = [];
      let token = '';
      do {
        // singleEvents=true makes Google expand every recurrence into its occurrences.
        const q = `singleEvents=true&maxResults=250&timeMin=${encodeURIComponent(new Date(w.from).toISOString())}&timeMax=${encodeURIComponent(new Date(w.to).toISOString())}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
        const page = await get(`/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
        for (const e of page.items ?? []) {
          const ev = fromGoogleEvent(calendarId, e);
          if (ev) out.push(ev);
        }
        token = page.nextPageToken ?? '';
      } while (token);
      return out;
    },
  };
}
