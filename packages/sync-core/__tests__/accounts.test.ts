/** The account each connected service is signed in to (#433): read, kept in Settings, never a secret. */
import {
  accountName,
  addIcsFeed,
  createIcsProvider,
  defaultSettings,
  fetchGoogleAccount,
  fetchTodoistAccount,
  icsCalendarName,
  icsFeedLabel,
  MAX_ACCOUNT_CHARS,
  parseSettings,
  removeIcsFeed,
  serializeSettings,
  setAccount,
  setIcsNames,
} from '../src';

const EMAIL = 'tester@example.com';

/** A fetch that answers one JSON body and records each call's address and Authorization. */
function answering(status: number, body: unknown) {
  const calls: string[] = [];
  const fetch = async (url: string, init: {headers?: Record<string, string>}) => {
    calls.push(`${url} ${init.headers?.Authorization ?? ''}`);
    return {ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body)};
  };
  return {fetch, calls};
}

describe('Todoist', () => {
  it('reads the account from GET /user with the stored token', async () => {
    const {fetch, calls} = answering(200, {email: EMAIL, full_name: 'Test User'});
    expect(await fetchTodoistAccount({token: 'test-token', fetch})).toBe(`Test User (${EMAIL})`);
    expect(calls).toEqual(['https://api.todoist.com/api/v1/user Bearer test-token']);
  });

  it('shows the email alone when there is no other name', async () => {
    expect(await fetchTodoistAccount({token: 'test-token', fetch: answering(200, {email: EMAIL}).fetch})).toBe(EMAIL);
    expect(await fetchTodoistAccount({token: 'test-token', fetch: answering(200, {email: EMAIL, full_name: EMAIL}).fetch})).toBe(EMAIL);
  });

  it('a refused or empty answer throws with the status only', async () => {
    await expect(fetchTodoistAccount({token: 'test-token', fetch: answering(401, {}).fetch})).rejects.toThrow('Todoist GET /user failed with HTTP 401');
    await expect(fetchTodoistAccount({token: 'test-token', fetch: answering(200, {full_name: 'x'}).fetch})).rejects.toThrow('no email');
  });
});

describe('Google', () => {
  it('reads the account from the primary calendar, whose id is the email', async () => {
    const {fetch, calls} = answering(200, {id: EMAIL, summary: EMAIL});
    expect(await fetchGoogleAccount(fetch, async () => 'access-fixture')).toBe(EMAIL);
    expect(calls).toEqual(['https://www.googleapis.com/calendar/v3/calendars/primary Bearer access-fixture']);
  });

  it('a refused or empty answer throws with the status only', async () => {
    await expect(fetchGoogleAccount(answering(403, {}).fetch, async () => 'a')).rejects.toThrow('HTTP 403');
    await expect(fetchGoogleAccount(answering(200, {}).fetch, async () => 'a')).rejects.toThrow('no id');
  });
});

describe('ICS', () => {
  const feed = (header: string[]) =>
    ['BEGIN:VCALENDAR', 'VERSION:2.0', ...header, 'BEGIN:VEVENT', 'UID:e', 'SUMMARY:X-WR-CALNAME:not this', 'DTSTART:20260301T100000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

  it('takes the calendar name from the header, never from an event', () => {
    expect(icsCalendarName(feed(['X-WR-CALNAME:Team\\, games']))).toBe('Team, games');
    expect(icsCalendarName(feed([]))).toBeUndefined();
    expect(icsCalendarName(feed(['X-WR-CALNAME: ']))).toBeUndefined();
  });

  it('the provider reports each feed name as it reads the feed', async () => {
    const names: [string, string][] = [];
    const p = createIcsProvider(async () => feed(['X-WR-CALNAME:Team']), [{id: 'f1', name: 'F', url: 'https://example.com/f.ics'}], () => {}, (id, n) => names.push([id, n]));
    await p.listEvents('f1', {from: 0, to: Date.UTC(2027, 0, 1)});
    expect(names).toEqual([['f1', 'Team']]);
  });

  it('a feed row shows its calendar name, else its host, never its address', () => {
    const url = 'https://feeds.example.com/private/token-1/a.ics';
    const s = addIcsFeed(defaultSettings(), url);
    expect(icsFeedLabel(s, url, 0)).toBe('ICS 1 (feeds.example.com)');
    const named = setIcsNames(s, {[url]: 'Team'});
    expect(icsFeedLabel(named, url, 0)).toBe('ICS 1 (Team)');
    expect(removeIcsFeed(named, url).accounts).toEqual({});
  });
});

describe('Settings', () => {
  it('keeps and forgets an account, and round-trips it', () => {
    const s = setAccount(defaultSettings(), 'todoist', ` ${EMAIL}\n`);
    expect(s.accounts).toEqual({todoist: EMAIL});
    expect(parseSettings(serializeSettings(s)).accounts).toEqual({todoist: EMAIL});
    expect(setAccount(s, 'todoist', undefined).accounts).toEqual({});
  });

  it('a file from before #433 has no account; a wrong type throws, never dropped', () => {
    const older = JSON.parse(serializeSettings(defaultSettings()));
    delete older.accounts;
    expect(parseSettings(JSON.stringify(older)).accounts).toEqual({});
    expect(() => parseSettings(JSON.stringify({...older, accounts: {google: 3}}))).toThrow('accounts.google is not a name');
    expect(() => parseSettings(JSON.stringify({...older, accounts: 'x'}))).toThrow('accounts is not an object');
  });

  it('a feed name of a feed no longer listed is dropped on read', () => {
    const stored = {...JSON.parse(serializeSettings(defaultSettings())), accounts: {ics: {'https://gone.example.com/a.ics': 'Old'}}};
    expect(parseSettings(JSON.stringify(stored)).accounts).toEqual({});
  });

  it('a name is one line, cut to the limit with a mark, never inside a character', () => {
    expect(accountName('a\nb')).toBe('a b');
    const cut = accountName('x'.repeat(MAX_ACCOUNT_CHARS + 5))!;
    expect(Array.from(cut)).toHaveLength(MAX_ACCOUNT_CHARS);
    expect(cut.endsWith('…')).toBe(true);
    expect(accountName('x'.repeat(MAX_ACCOUNT_CHARS))).toBe('x'.repeat(MAX_ACCOUNT_CHARS));
    const emoji = accountName('😀'.repeat(MAX_ACCOUNT_CHARS + 1))!;
    expect(Array.from(emoji).slice(0, -1).every(char => char === '😀')).toBe(true);
    expect(accountName('  ')).toBeUndefined();
  });
});
