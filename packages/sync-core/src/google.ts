import {CalendarEvent, CalendarInfo, CalendarProvider, TimeWindow} from './calendar';
import {HttpFetch} from './http';

/**
 * Google Calendar as a CalendarProvider (Calendar API v3) and the OAuth device-code sign-in.
 * `fetch` is injected, so tests need no network. Tokens live only in the owner's secure store.
 * Not yet run against a live account: the owner verifies it on the Mac (issue #28).
 */
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const OAUTH_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface DeviceCodePrompt {
  deviceCode: string;
  /** The short code the owner types on a phone. */
  userCode: string;
  verificationUrl: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const FORM = {'Content-Type': 'application/x-www-form-urlencoded'};

export async function startDeviceCode(fetch: HttpFetch, client: OAuthClient): Promise<DeviceCodePrompt> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: FORM,
    body: form({client_id: client.clientId, scope: GOOGLE_CALENDAR_SCOPE}),
  });
  if (!res.ok) throw new Error(`Google device code request failed with HTTP ${res.status}`);
  const j = (await res.json()) as {device_code: string; user_code: string; verification_url: string; interval?: number; expires_in: number};
  return {
    deviceCode: j.device_code,
    userCode: j.user_code,
    verificationUrl: j.verification_url,
    intervalSeconds: j.interval ?? 5,
    expiresInSeconds: j.expires_in,
  };
}

export type PollResult =
  | {status: 'pending'}
  | {status: 'slow_down'}
  | {status: 'denied'}
  | {status: 'expired'}
  | {status: 'granted'; refreshToken: string; accessToken: string; expiresInSeconds: number};

/** One poll of the token endpoint; the caller waits `intervalSeconds` between calls. */
export async function pollDeviceCode(fetch: HttpFetch, client: OAuthClient, deviceCode: string): Promise<PollResult> {
  const res = await fetch(OAUTH_ENDPOINT, {
    method: 'POST',
    headers: FORM,
    body: form({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const j = (await res.json()) as {error?: string; access_token?: string; refresh_token?: string; expires_in?: number};
  if (res.ok && j.access_token && j.refresh_token) {
    return {status: 'granted', accessToken: j.access_token, refreshToken: j.refresh_token, expiresInSeconds: j.expires_in ?? 3600};
  }
  switch (j.error) {
    case 'authorization_pending':
      return {status: 'pending'};
    case 'slow_down':
      return {status: 'slow_down'};
    case 'access_denied':
      return {status: 'denied'};
    case 'expired_token':
      return {status: 'expired'};
    default:
      throw new Error(`Google token request failed: ${j.error ?? `HTTP ${res.status}`}`);
  }
}

export async function refreshAccessToken(fetch: HttpFetch, client: OAuthClient, refreshToken: string): Promise<string> {
  const res = await fetch(OAUTH_ENDPOINT, {
    method: 'POST',
    headers: FORM,
    body: form({client_id: client.clientId, client_secret: client.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token'}),
  });
  const j = (await res.json()) as {access_token?: string};
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

/** `getAccessToken` is called per request so a refreshed token is always used. */
export function createGoogleCalendarProvider(fetch: HttpFetch, getAccessToken: () => Promise<string>): CalendarProvider {
  const get = async (path: string): Promise<any> => {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method: 'GET',
      headers: {Authorization: `Bearer ${await getAccessToken()}`},
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
