/**
 * Bridge Settings model: every module and every provider is opt in, off by default.
 * Pure data and rules; the plugin stores the JSON and draws the switches (#40).
 */

export type ModuleId = 'todo' | 'calendar' | 'digest';
export type ProviderId = 'todoist' | 'google' | 'icloud' | 'ics';

/** Which providers belong to which module. The one owner of this map. */
export const MODULE_PROVIDERS: Record<ModuleId, ProviderId[]> = {
  todo: ['todoist'],
  calendar: ['google', 'icloud', 'ics'],
  digest: [],
};

export const MODULES = Object.keys(MODULE_PROVIDERS) as ModuleId[];

export interface BridgeSettings {
  schema: 1;
  modules: Record<ModuleId, boolean>;
  providers: Record<ProviderId, boolean>;
}

export function defaultSettings(): BridgeSettings {
  return {
    schema: 1,
    modules: {todo: false, calendar: false, digest: false},
    providers: {todoist: false, google: false, icloud: false, ics: false},
  };
}

/** Parse stored JSON. Unknown keys are dropped; a wrong schema or shape throws, never defaults silently. */
export function parseSettings(raw: string): BridgeSettings {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) throw new Error('settings: not an object');
  const v = value as {schema?: unknown; modules?: unknown; providers?: unknown};
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

export function setProvider(s: BridgeSettings, id: ProviderId, on: boolean): BridgeSettings {
  const owner = MODULES.find(m => MODULE_PROVIDERS[m].includes(id));
  if (on && owner && !s.modules[owner]) throw new Error(`settings: turn on the ${owner} module before ${id}`);
  return {...s, providers: {...s.providers, [id]: on}};
}

/** What the device adapter's probe says per module: `available` false disables the module. */
export type ModuleAvailability = Partial<Record<ModuleId, boolean>>;

export interface ActivePlan {
  modules: ModuleId[];
  providers: ProviderId[];
  /** Modules the user turned on that the probe turned off, with no write attempted. */
  blocked: ModuleId[];
}

/** The modules and providers that may run: opted in AND the device probe passed. */
export function activePlan(s: BridgeSettings, available: ModuleAvailability): ActivePlan {
  const modules: ModuleId[] = [];
  const blocked: ModuleId[] = [];
  for (const m of MODULES) {
    if (!s.modules[m]) continue;
    // A missing probe answer counts as unavailable: never write without proof.
    (available[m] === true ? modules : blocked).push(m);
  }
  const providers = modules.flatMap(m => MODULE_PROVIDERS[m].filter(p => s.providers[p]));
  return {modules, providers, blocked};
}
