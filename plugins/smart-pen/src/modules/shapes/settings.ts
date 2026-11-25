/**
 * Smart Shapes' settings (#253), one owner for every default.
 *
 * shortcut: the settings live in memory and reset when the plugin restarts, as the other plugins'
 * do; upgrade when the plugin storage lands (#40).
 */
import type {ShapeKind} from './recognize';

export type Settings = {
  /** The switch that turns the feature on and off. */
  on: boolean;
  /** A figure whose larger side is under this many millimetres stays handwriting. */
  minSizeMm: number;
  shapes: Record<ShapeKind, boolean>;
};

/** About two handwriting lines (#253): the owner's x-height is about 35 to 40 px. */
export const DEFAULT_MIN_SIZE_MM = 16;
export const MIN_SIZE_CHOICES_MM = [8, 12, 16, 24, 32] as const;

export const DEFAULT_SETTINGS: Settings = {
  on: true,
  minSizeMm: DEFAULT_MIN_SIZE_MM,
  shapes: {triangle: true, circle: true, square: true, rect: true, arrow: true},
};

/** Both screens show about 300 ppi (docs/supernote.md › Screens). */
export const PX_PER_MM = 300 / 25.4;
/** The pen must stay still this long at the end of the stroke, as Snap's default. */
export const HOLD_MS = 350;
/** Jitter allowed during the hold, in screen pixels. */
export const STILL_RADIUS_PX = 12;
/** Snap's middle tolerance on its 1 (strict) to 5 (lenient) scale. */
export const TOLERANCE = 3;
/** Rectangles and arrows within this angle of the page axes are straightened. */
export const SNAP_DEGREES = 8;

let current: Settings = DEFAULT_SETTINGS;

export function getSettings(): Settings {
  return current;
}

export function setSettings(next: Settings): void {
  current = next;
}

export function minSizePx(settings: Settings): number {
  return settings.minSizeMm * PX_PER_MM;
}
