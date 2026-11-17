import {requireHttps} from '../src/http';
import {httpsUrl} from '../src/ics';
import {createTodoistProvider} from '../src/todoist';
import {parseUrl} from '../src/url';

describe('parseUrl over the real sign-in and API URLs (#209)', () => {
  it.each([
    ['https://oauth2.googleapis.com/token', 'https:', 'oauth2.googleapis.com', '', '/token', ''],
    ['https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=250', 'https:', 'www.googleapis.com', '', '/calendar/v3/calendars/primary/events', '?singleEvents=true&maxResults=250'],
    ['https://api.todoist.com/api/v1', 'https:', 'api.todoist.com', '', '/api/v1', ''],
    ['https://api.todoist.com/api/v1/tasks/7/close', 'https:', 'api.todoist.com', '', '/api/v1/tasks/7/close', ''],
    ['https://p42-caldav.icloud.com:443/1234567890/calendars/home/', 'https:', 'p42-caldav.icloud.com', '443', '/1234567890/calendars/home/', ''],
    [httpsUrl('webcal://p42-calendars.icloud.com/published/2/abc'), 'https:', 'p42-calendars.icloud.com', '', '/published/2/abc', ''],
    ['HTTP://CalDAV.Example.com', 'http:', 'caldav.example.com', '', '/', ''],
    ['http://[::1]:8080/x', 'http:', '[::1]', '8080', '/x', ''],
  ])('%s', (url, protocol, hostname, port, pathname, search) => {
    expect(parseUrl(url)).toEqual({
      protocol,
      hostname,
      port,
      host: port ? `${hostname}:${port}` : hostname,
      pathname,
      search,
      hash: '',
    });
  });

  it('keeps the user information out of every part', () => {
    const parts = parseUrl('https://someone@caldav.example.com/home/#top');
    expect(parts).toMatchObject({host: 'caldav.example.com', pathname: '/home/', hash: '#top'});
    expect(JSON.stringify(parts)).not.toContain('someone');
  });

  it.each(['', 'api.todoist.com/api/v1', '/token', 'https://', 'https:///x', 'https://x:ab/', 'https://a b.com/', 'https://x\n/', 'mailto:a@example.com'])(
    'refuses %j',
    url => expect(parseUrl(url)).toBeNull(),
  );
});

describe('requireHttps under React Native URL (#209)', () => {
  const NodeUrl = globalThis.URL;
  // React Native 0.79's URL: it parses, but `protocol`, `host` and the other getters throw.
  class ReactNativeUrl {
    constructor(private readonly url: string) {}
    get protocol(): string {
      throw new Error('URL.protocol is not implemented');
    }
    get host(): string {
      throw new Error('URL.host is not implemented');
    }
    toString() {
      return this.url;
    }
  }
  beforeEach(() => {
    globalThis.URL = ReactNativeUrl as unknown as typeof URL;
  });
  afterEach(() => {
    globalThis.URL = NodeUrl;
  });

  it('builds the Todoist provider', () => {
    expect(() => createTodoistProvider({token: 't', fetch: async () => ({ok: true, status: 200, json: async () => ({}), text: async () => ''})})).not.toThrow();
  });

  it('returns an https URL and names only the scheme and host of any other', () => {
    expect(requireHttps('https://api.todoist.com/api/v1', 'Todoist base URL')).toBe('https://api.todoist.com/api/v1');
    expect(() => requireHttps('http://someone@caldav.example.com/home/?k=v', 'CalDAV calendar')).toThrow(
      /^CalDAV calendar needs an https: URL, got http:\/\/caldav\.example\.com$/,
    );
    expect(() => requireHttps('not a url', 'ICS feed')).toThrow(/^ICS feed needs an https: URL$/);
  });
});
