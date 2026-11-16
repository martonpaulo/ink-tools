/**
 * Real-Time Conversion's settings (#184), one owner for every default. The word rule reads them
 * when the mode turns on.
 *
 * shortcut: the settings live in memory and reset when the plugin restarts, as Lingo's and
 * Bridge's do, so «Start with Real-Time Text on» holds only until then; upgrade when the plugin
 * storage lands (#40).
 */
import {DEFAULT_WORD_OPTIONS, WordOptions} from './words';

export type Spacing = 'tight' | 'normal' | 'wide';
export type Wait = 'short' | 'normal' | 'long';

export type Settings = {startOn: boolean; spacing: Spacing; wait: Wait};

export const DEFAULT_SETTINGS: Settings = {startOn: false, spacing: 'normal', wait: 'normal'};

/** Ink2Pic's Word spacing values (brief › 8.11). */
export const SPACING: Record<Spacing, number> = {tight: 0.7, normal: 1, wide: 1.4};
/** The idle close; Normal is the rule's default, every value above the 656 ms pause in a word. */
export const WAIT_MS: Record<Wait, number> = {
  short: 1500,
  normal: DEFAULT_WORD_OPTIONS.idleMs,
  long: 3000,
};

let current: Settings = DEFAULT_SETTINGS;

export function getSettings(): Settings {
  return current;
}

export function setSettings(next: Settings): void {
  current = next;
}

/** The word rule's options for these settings. */
export function wordOptions(settings: Settings): WordOptions {
  return {
    ...DEFAULT_WORD_OPTIONS,
    spacing: SPACING[settings.spacing],
    idleMs: WAIT_MS[settings.wait],
  };
}
