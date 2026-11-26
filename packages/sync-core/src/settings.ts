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
}

export function defaultSettings(): BridgeSettings {
  return {
    schema: 1,
    modules: {todo: false, calendar: false, digest: false},
    providers: {todoist: false, google: false, icloud: false, ics: false},
    sendTabletOnly: {todo: false, calendar: false},
    firstLinked: {},
    icsFeeds: [],
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
  const v = value as {schema?: unknown; modules?: unknown; providers?: unknown; sendTabletOnly?: unknown; firstLinked?: unknown; icsFeeds?: unknown};
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
  return out;
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

export function removeIcsFeed(s: BridgeSettings, url: string): BridgeSettings {
  return {...s, icsFeeds: s.icsFeeds.filter(f => f !== url)};
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
