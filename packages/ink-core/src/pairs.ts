/**
 * Lingo Settings model: each language pair is one opt-in toggle for both directions, off by
 * default (docs/architecture.md). Pure data and rules; the plugin stores the JSON and draws the
 * switches (#46). Same shape as Bridge's model in sync-core/src/settings.ts.
 */
import type {LanguageCode} from './dictionary';

export interface LanguagePair {
  /** Stable Settings key, as docs/architecture.md writes it: the other language, then `pt`. */
  id: string;
  languages: readonly [LanguageCode, LanguageCode];
}

/**
 * The pairs Lingo offers, priority order (docs/plugin-scope.md: PT<->ES and PT<->ZH, not EN for
 * now). The one owner of this list: adding a pair is one row here.
 */
export const PAIRS: readonly LanguagePair[] = [
  {id: 'es-pt', languages: ['es', 'pt']},
  {id: 'zh-pt', languages: ['zh', 'pt']},
];

export interface LingoSettings {
  schema: 1;
  /** Pair id to on/off. Every id in PAIRS has a key. */
  pairs: Record<string, boolean>;
}

export interface Direction {
  from: LanguageCode;
  to: LanguageCode;
}

export function defaultSettings(): LingoSettings {
  return {schema: 1, pairs: Object.fromEntries(PAIRS.map(p => [p.id, false]))};
}

/**
 * Parse stored JSON. A pair missing from storage keeps its default, so a pair added later never
 * breaks saved settings; unknown keys are dropped; a wrong schema or shape throws, never defaults
 * silently.
 */
export function parseSettings(raw: string): LingoSettings {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) throw new Error('settings: not an object');
  const v = value as {schema?: unknown; pairs?: unknown};
  if (v.schema !== 1) throw new Error(`settings: unsupported schema ${String(v.schema)}`);
  if (typeof v.pairs !== 'object' || v.pairs === null) throw new Error('settings: pairs missing');
  const out = defaultSettings();
  for (const {id} of PAIRS) {
    const flag = (v.pairs as Record<string, unknown>)[id];
    if (flag === undefined) continue;
    if (typeof flag !== 'boolean') throw new Error(`settings: pairs.${id} is not a boolean`);
    out.pairs[id] = flag;
  }
  return out;
}

export const serializeSettings = (s: LingoSettings): string => JSON.stringify(s);

export function setPair(s: LingoSettings, id: string, on: boolean): LingoSettings {
  if (!PAIRS.some(p => p.id === id)) throw new Error(`settings: unknown pair ${id}`);
  return {...s, pairs: {...s.pairs, [id]: on}};
}

/** Both directions of each pair, in PAIRS order. */
const bothWays = (pairs: readonly LanguagePair[]): Direction[] =>
  pairs.flatMap(({languages: [a, b]}) => [
    {from: a, to: b},
    {from: b, to: a},
  ]);

/** Every direction the opted-in pairs allow, both ways each, in PAIRS order (Lingo's switches). */
export function enabledDirections(s: Pick<LingoSettings, 'pairs'>): Direction[] {
  return bothWays(PAIRS.filter(p => s.pairs[p.id] === true));
}

/**
 * Every direction of every pair, in PAIRS order: Lookup's one Translate button per direction
 * (#174). Adding a pair to PAIRS adds its two directions here, after the others.
 */
export const ALL_DIRECTIONS: readonly Direction[] = bothWays(PAIRS);

/** A direction's stable Settings key: `es-pt` for Spanish to Portuguese. */
export const directionId = ({from, to}: Direction): string => `${from}-${to}`;
