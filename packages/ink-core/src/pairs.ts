/**
 * The translation language pairs and their directions (docs/plugin-scope.md), which Lookup's
 * «Translate ES→PT» buttons read (#174). Pure data; Lookup stores which directions are on.
 */
import type {LanguageCode} from './dictionary';

export interface LanguagePair {
  /** Stable Settings key, as docs/architecture.md writes it: the other language, then `pt`. */
  id: string;
  languages: readonly [LanguageCode, LanguageCode];
}

/**
 * The pairs offered, priority order (docs/plugin-scope.md: PT<->ES and PT<->ZH, not EN for
 * now). The one owner of this list: adding a pair is one row here.
 */
export const PAIRS: readonly LanguagePair[] = [
  {id: 'es-pt', languages: ['es', 'pt']},
  {id: 'zh-pt', languages: ['zh', 'pt']},
];

export interface Direction {
  from: LanguageCode;
  to: LanguageCode;
}

/** Both directions of each pair, in PAIRS order. */
const bothWays = (pairs: readonly LanguagePair[]): Direction[] =>
  pairs.flatMap(({languages: [a, b]}) => [
    {from: a, to: b},
    {from: b, to: a},
  ]);

/**
 * Every direction of every pair, in PAIRS order: Lookup's one Translate button per direction
 * (#174). Adding a pair to PAIRS adds its two directions here, after the others.
 */
export const ALL_DIRECTIONS: readonly Direction[] = bothWays(PAIRS);

/** A direction's stable Settings key: `es-pt` for Spanish to Portuguese. */
export const directionId = ({from, to}: Direction): string => `${from}-${to}`;
