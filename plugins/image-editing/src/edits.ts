/**
 * Retouch's edits (#136): each one is a button of the editor view and a switch in Settings. A new
 * edit is one row here; the editor and the Settings view follow it. The lasso menu holds one
 * «Image Editing» row, which opens the editor (#226).
 */
import {copy} from './copy';
import type {StyleId} from './native';

export type EditId =
  | 'enhance'
  | 'lighter'
  | 'darker'
  | 'undo'
  | 'restore'
  | 'rotate'
  | 'mirror'
  | 'flip'
  | 'invert'
  | 'trim'
  | 'background'
  | 'sticker'
  | 'document'
  | 'styles'
  | 'enhance_all'
  | 'undo_all'
  | 'crop'
  | 'erase';

export type EditDefinition = {
  id: EditId;
  name: string;
};

/** The one lasso button, «Image Editing», which opens the editor view (#226). */
export const EDITOR_BUTTON_ID = 300;

/** The toolbar button «Image Editing», which the owner can pin; the same editor (#248). */
export const EDITOR_TOOLBAR_ID = 301;

/**
 * The lasso button ids of the builds before #226, one per edit from 200 in `ORDER`. The start-up
 * removes them, so an update never leaves the old rows in the lasso menu.
 * shortcut: the removal assumes the host may keep a button across a plugin update; drop it once a
 * device round shows the menu holds one Image Editing row after an update from beta 10.
 */
const FIRST_LEGACY_BUTTON_ID = 200;

const ORDER: readonly EditId[] = [
  'enhance',
  'lighter',
  'darker',
  'undo',
  'restore',
  // #131: appended, so the ids above keep theirs.
  'rotate',
  'mirror',
  'flip',
  'invert',
  // #132
  'trim',
  // #134: appended, so the ids above keep theirs.
  'background',
  'sticker',
  // #137
  'document',
  // #133: the grid of styles, a view.
  'styles',
  // #140: every picture on the page, from the lasso of one of them.
  'enhance_all',
  'undo_all',
  // #132: the rectangle drawn with the pen over the picture, lassoed with it.
  'crop',
  // #134: the marks drawn with the pen over the picture, lassoed with it.
  'erase',
];

export const EDITS: readonly EditDefinition[] = ORDER.map(id => ({
  id,
  name: copy[`edit.${id}`],
}));

export const LEGACY_BUTTON_IDS: readonly number[] = ORDER.map(
  (_, index) => FIRST_LEGACY_BUTTON_ID + index,
);

/** The grid's styles in their default order (#133); each is a switch in Settings. */
export const STYLE_ORDER: readonly StyleId[] = [
  'photo',
  'line_art',
  'black_white',
  'dither',
  'atkinson',
];

export type StyleDefinition = {id: StyleId; name: string};

export const STYLES: readonly StyleDefinition[] = STYLE_ORDER.map(id => ({
  id,
  name: copy[`style.${id}`],
}));

export type RetouchSettings = {
  edits: Record<EditId, boolean>;
  styles: Record<StyleId, boolean>;
  /** Saves each edit's input and mask as PNGs for the Mac to pull (#134); off by default. */
  debug: boolean;
};

const allOn = <K extends string>(ids: readonly K[]) =>
  Object.fromEntries(ids.map(id => [id, true])) as Record<K, boolean>;

/** Every edit and style starts on: the plugin exists for them, and none needs a permission. */
export const defaultSettings: RetouchSettings = {
  edits: allOn(ORDER),
  styles: allOn(STYLE_ORDER),
  debug: false,
};

export function setEdit(
  settings: RetouchSettings,
  id: EditId,
  on: boolean,
): RetouchSettings {
  return {...settings, edits: {...settings.edits, [id]: on}};
}

export function setStyle(
  settings: RetouchSettings,
  id: StyleId,
  on: boolean,
): RetouchSettings {
  return {...settings, styles: {...settings.styles, [id]: on}};
}

export function enabledStyles(settings: RetouchSettings): StyleId[] {
  return STYLE_ORDER.filter(id => settings.styles[id]);
}

/** The edits switched on; Styles only while at least one style is, so the grid is never empty. */
export function enabledEdits(settings: RetouchSettings): EditDefinition[] {
  return EDITS.filter(
    edit =>
      settings.edits[edit.id] &&
      (edit.id !== 'styles' || enabledStyles(settings).length > 0),
  );
}

export function editOf(id: EditId): EditDefinition {
  return EDITS.find(edit => edit.id === id)!;
}

// shortcut: the settings live in memory and reset when Retouch restarts, as Lingo's do; upgrade
// when the plugin storage lands (#40). One copy, so the editor reads the switches Settings set.
let current: RetouchSettings = defaultSettings;

export function currentSettings(): RetouchSettings {
  return current;
}

export function rememberSettings(next: RetouchSettings): void {
  current = next;
}
