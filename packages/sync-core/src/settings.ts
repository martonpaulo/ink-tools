/**
 * Bridge Settings model: every module and every provider is opt in, off by default.
 * Pure data and rules; the plugin stores the JSON and draws the switches (#40).
 */
import {parseUrl} from './url';

export type ModuleId = 'todo' | 'calendar' | 'digest';
export type ProviderId = 'todoist' | 'google' | 'icloud' | 'ics';

/** Which providers belong to which module. The one owner of this map. */
export const MODULE_PROVIDERS: Record<ModuleId, ProviderId[]> = {
  todo: ['todoist'],
  calendar: ['google', 'icloud', 'ics'],
  digest: [],
};

/** Providers a sync only reads: an ICS feed is never written, so no tablet item is sent there (#411). */
export const READ_ONLY_PROVIDERS: readonly ProviderId[] = ['ics'];

export const MODULES = Object.keys(MODULE_PROVIDERS) as ModuleId[];

/** The modules that sync both ways, so they can hold tablet-only items. */
export type TwoWayModule = 'todo' | 'calendar';
export const TWO_WAY_MODULES: TwoWayModule[] = ['todo', 'calendar'];

export interface BridgeSettings {
  schema: 1;
  modules: Record<ModuleId, boolean>;
  providers: Record<ProviderId, boolean>;
  /** «Send tablet-only items», off by default: off, items the tablet held before the first link stay local. */
  sendTabletOnly: Record<TwoWayModule, boolean>;
  /** Epoch ms of each module's first pass, kept as the record of the first link. */
  firstLinked: Partial<Record<TwoWayModule, number>>;
  /**
   * The ICS feeds the `ics` provider reads, each its `https:` or `webcal:` address as the owner
   * gave it (#30). A private feed's address is a secret of its own, so Settings never shows it whole.
   */
  icsFeeds: string[];
  /**
   * The calendar that receives an event made on the tablet (#29), by its service id, as a pass
   * lists it (`ModuleRun.calendars`); absent, such an event stays on the tablet and is reported.
   */
  defaultCalendarId?: string;
  /**
   * The account each connected service is signed in to, as its row shows it (#433): read from the
   * service at a sync pass, kept only here, never logged. iCloud's comes from its sign-in instead.
   */
  accounts: Accounts;
}

/** The services whose account a pass reads, with no secret part (#433). */
export type AccountProvider = 'todoist' | 'google';
export const ACCOUNT_PROVIDERS: AccountProvider[] = ['todoist', 'google'];

export interface Accounts {
  todoist?: string;
  google?: string;
  /** Each ICS feed's calendar name, by its address as `icsFeeds` keeps it. */
  ics?: Record<string, string>;
}

/** The longest account or calendar name kept; a longer one is cut, never refused. */
export const MAX_ACCOUNT_CHARS = 96;

/**
 * A name as Settings keeps it: one trimmed line; empty is no name. A longer name is cut between
 * characters, never inside one, and ends with «…», so a cut address never reads as another one.
 */
export function accountName(raw: string): string | undefined {
  const line = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (!line) {
    return undefined;
  }
  const chars = Array.from(line);
  return chars.length > MAX_ACCOUNT_CHARS ? `${chars.slice(0, MAX_ACCOUNT_CHARS - 1).join('')}…` : line;
}

export function defaultSettings(): BridgeSettings {
  return {
    schema: 1,
    modules: {todo: false, calendar: false, digest: false},
    providers: {todoist: false, google: false, icloud: false, ics: false},
    sendTabletOnly: {todo: false, calendar: false},
    firstLinked: {},
    icsFeeds: [],
    accounts: {},
  };
}

/** The most ICS feeds Settings keeps; the owner has three (#30). */
export const MAX_ICS_FEEDS = 20;

/** A `webcal:` address is the same feed over HTTPS. */
const WEBCAL = /^webcal:\/\//i;

/** An ICS feed address as Settings keeps it, trimmed, or a refusal naming why. */
export function icsFeedAddress(raw: string): string {
  const url = raw.trim();
  const parsed = parseUrl(url.replace(WEBCAL, 'https://'));
  if (!parsed || parsed.protocol !== 'https:') throw new Error('settings: an ICS feed needs an https: or webcal: address');
  return url;
}

/** Parse stored JSON. Unknown keys are dropped; a wrong schema or shape throws, never defaults silently. */
export function parseSettings(raw: string): BridgeSettings {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) throw new Error('settings: not an object');
  const v = value as {schema?: unknown; modules?: unknown; providers?: unknown; sendTabletOnly?: unknown; firstLinked?: unknown; icsFeeds?: unknown; defaultCalendarId?: unknown; accounts?: unknown};
  if (v.schema !== 1) throw new Error(`settings: unsupported schema ${String(v.schema)}`);
  const out = defaultSettings();
  for (const [key, target] of [['modules', out.modules], ['providers', out.providers]] as const) {
    const part = v[key];
    if (typeof part !== 'object' || part === null) throw new Error(`settings: ${key} missing`);
    for (const k of Object.keys(target)) {
      const flag = (part as Record<string, unknown>)[k];
      if (flag === undefined) continue;
      if (typeof flag !== 'boolean') throw new Error(`settings: ${key}.${k} is not a boolean`);
      (target as Record<string, boolean>)[k] = flag;
    }
  }
  // Both keys came after schema 1 shipped: absent is the safe default, a wrong type throws.
  for (const [key, kind] of [['sendTabletOnly', 'boolean'], ['firstLinked', 'number']] as const) {
    const part = v[key];
    if (part === undefined) continue;
    if (typeof part !== 'object' || part === null) throw new Error(`settings: ${key} is not an object`);
    for (const m of TWO_WAY_MODULES) {
      const value = (part as Record<string, unknown>)[m];
      if (value === undefined) continue;
      if (typeof value !== kind) throw new Error(`settings: ${key}.${m} is not a ${kind}`);
      (out[key] as Record<string, unknown>)[m] = value;
    }
  }
  // Came after schema 1 shipped (#30): absent is no feed; a wrong address throws, never dropped.
  if (v.icsFeeds !== undefined) {
    if (!Array.isArray(v.icsFeeds) || v.icsFeeds.length > MAX_ICS_FEEDS) throw new Error('settings: icsFeeds is not a list of addresses');
    out.icsFeeds = v.icsFeeds.map(f => {
      if (typeof f !== 'string') throw new Error('settings: icsFeeds holds a value that is not an address');
      return icsFeedAddress(f);
    });
  }
  // Came after schema 1 shipped (#29): absent is no default calendar; a wrong type throws.
  if (v.defaultCalendarId !== undefined) {
    if (typeof v.defaultCalendarId !== 'string' || v.defaultCalendarId === '') throw new Error('settings: defaultCalendarId is not a calendar id');
    out.defaultCalendarId = v.defaultCalendarId;
  }
  if (v.accounts !== undefined) out.accounts = parseAccounts(v.accounts, out.icsFeeds);
  return out;
}

/** Came after schema 1 shipped (#433): absent is no name; a wrong type throws, never dropped. */
function parseAccounts(raw: unknown, feeds: string[]): Accounts {
  const text = (value: unknown, key: string) => {
    if (typeof value !== 'string') throw new Error(`settings: accounts.${key} is not a name`);
    return accountName(value);
  };
  if (typeof raw !== 'object' || raw === null) throw new Error('settings: accounts is not an object');
  const a = raw as Record<string, unknown>;
  const out: Accounts = {};
  for (const p of ACCOUNT_PROVIDERS) {
    const name = a[p] === undefined ? undefined : text(a[p], p);
    if (name) out[p] = name;
  }
  if (a.ics !== undefined) {
    if (typeof a.ics !== 'object' || a.ics === null) throw new Error('settings: accounts.ics is not an object');
    const ics: Record<string, string> = {};
    // A name of a feed no longer in the list is dropped with it.
    for (const [url, value] of Object.entries(a.ics)) {
      const name = text(value, 'ics');
      if (name && feeds.includes(url)) ics[url] = name;
    }
    if (Object.keys(ics).length) out.ics = ics;
  }
  return out;
}

/** Keep or forget the account a service is signed in to (#433); forgetting is a sign-out's. */
export function setAccount(s: BridgeSettings, id: AccountProvider, name: string | undefined): BridgeSettings {
  const {[id]: _old, ...rest} = s.accounts;
  const kept = name === undefined ? undefined : accountName(name);
  return {...s, accounts: kept ? {...rest, [id]: kept} : rest};
}

/** Keep the calendar names read from the ICS feeds (#433), only of feeds still in the list. */
export function setIcsNames(s: BridgeSettings, names: Record<string, string>): BridgeSettings {
  const ics: Record<string, string> = {};
  for (const url of s.icsFeeds) {
    const name = names[url] === undefined ? s.accounts.ics?.[url] : accountName(names[url]);
    if (name) ics[url] = name;
  }
  const {ics: _old, ...rest} = s.accounts;
  return {...s, accounts: Object.keys(ics).length ? {...rest, ics} : rest};
}

export const serializeSettings = (s: BridgeSettings): string => JSON.stringify(s);

export function setModule(s: BridgeSettings, id: ModuleId, on: boolean): BridgeSettings {
  const next: BridgeSettings = {...s, modules: {...s.modules, [id]: on}};
  // Turning a module off also turns its providers off, so nothing runs behind a hidden switch.
  if (!on) {
    next.providers = {...s.providers};
    for (const p of MODULE_PROVIDERS[id]) next.providers[p] = false;
  }
  return next;
}

export function setSendTabletOnly(s: BridgeSettings, id: TwoWayModule, on: boolean): BridgeSettings {
  return {...s, sendTabletOnly: {...s.sendTabletOnly, [id]: on}};
}

/** Choose the calendar for events made on the tablet (#29); `undefined` clears the choice. */
export function setDefaultCalendar(s: BridgeSettings, calendarId: string | undefined): BridgeSettings {
  const next: BridgeSettings = {...s, defaultCalendarId: calendarId};
  if (!calendarId) delete next.defaultCalendarId;
  return next;
}

/** Add one ICS feed; the same address twice is kept once, and past `MAX_ICS_FEEDS` it throws. */
export function addIcsFeed(s: BridgeSettings, raw: string): BridgeSettings {
  const url = icsFeedAddress(raw);
  if (s.icsFeeds.includes(url)) return s;
  if (s.icsFeeds.length >= MAX_ICS_FEEDS) throw new Error(`settings: at most ${MAX_ICS_FEEDS} ICS feeds`);
  return {...s, icsFeeds: [...s.icsFeeds, url]};
}

/**
 * A feed's name, in Settings and on its calendar: its place in the list and its host, never the
 * whole address, which can hold a secret path or query (#30).
 */
export function icsFeedName(url: string, index: number): string {
  return `ICS ${index + 1} (${parseUrl(url.replace(WEBCAL, 'https://'))?.host ?? 'feed'})`;
}

/**
 * A feed's row in Settings (#433): its place and the calendar name the feed gave at the last pass,
 * else its host, as `icsFeedName`. The tablet calendar keeps `icsFeedName`, so a renamed feed never
 * moves its events.
 */
export function icsFeedLabel(s: BridgeSettings, url: string, index: number): string {
  const name = s.accounts.ics?.[url];
  return name ? `ICS ${index + 1} (${name})` : icsFeedName(url, index);
}

export function removeIcsFeed(s: BridgeSettings, url: string): BridgeSettings {
  const next = {...s, icsFeeds: s.icsFeeds.filter(f => f !== url)};
  return setIcsNames(next, {});
}

export function setProvider(s: BridgeSettings, id: ProviderId, on: boolean): BridgeSettings {
  const owner = MODULES.find(m => MODULE_PROVIDERS[m].includes(id));
  if (on && owner && !s.modules[owner]) throw new Error(`settings: turn on the ${owner} module before ${id}`);
  return {...s, providers: {...s.providers, [id]: on}};
}

/**
 * What the device adapter's probe says per module: its reads matched (`available`) and a test write
 * passed (`canWrite`). Every module writes, so either false disables it (#67).
 */
export type ModuleAvailability = Partial<Record<ModuleId, {available: boolean; canWrite: boolean}>>;

export interface ActivePlan {
  modules: ModuleId[];
  providers: ProviderId[];
  /** Modules the user turned on that the probe turned off, with no write attempted. */
  blocked: ModuleId[];
  /** Each two-way module's «Send tablet-only items» switch. */
  sendTabletOnly: Record<TwoWayModule, boolean>;
}

/** The modules and providers that may run: opted in AND the device probe passed. */
export function activePlan(s: BridgeSettings, available: ModuleAvailability): ActivePlan {
  const modules: ModuleId[] = [];
  const blocked: ModuleId[] = [];
  for (const m of MODULES) {
    if (!s.modules[m]) continue;
    // A missing probe answer counts as unavailable: never write without proof.
    const proof = available[m];
    (proof?.available === true && proof.canWrite === true ? modules : blocked).push(m);
  }
  const providers = modules.flatMap(m => MODULE_PROVIDERS[m].filter(p => s.providers[p]));
  return {modules, providers, blocked, sendTabletOnly: {...s.sendTabletOnly}};
}
