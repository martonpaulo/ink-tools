/**
 * Retouch's edits (#136): each one is a lasso button and a switch in Settings. A new edit is one
 * row here; the buttons and the Settings view follow it.
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
  | 'undo_all';

/** `showType` 1, a full view, for an edit that shows a screen first (#133); 0 runs with no view. */
export type EditDefinition = {
  id: EditId;
  buttonId: number;
  name: string;
  showType: 0 | 1;
};

/** The first edit button's id; each edit keeps its place, so an id never changes. */
export const FIRST_BUTTON_ID = 200;

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
];

/** The edits that open a view (#133). */
const WITH_VIEW: ReadonlySet<EditId> = new Set(['styles']);

export const EDITS: readonly EditDefinition[] = ORDER.map((id, index) => ({
  id,
  buttonId: FIRST_BUTTON_ID + index,
  name: copy[`edit.${id}`],
  showType: WITH_VIEW.has(id) ? 1 : 0,
}));

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
};

const allOn = <K extends string>(ids: readonly K[]) =>
  Object.fromEntries(ids.map(id => [id, true])) as Record<K, boolean>;

/** Every edit and style starts on: the plugin exists for them, and none needs a permission. */
export const defaultSettings: RetouchSettings = {
  edits: allOn(ORDER),
  styles: allOn(STYLE_ORDER),
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

/** The edit a pressed button stands for, or null for an id that is not Retouch's. */
export function editOfButton(id: number): EditDefinition | null {
  return EDITS.find(edit => edit.buttonId === id) ?? null;
}

// shortcut: the settings live in memory and reset when Retouch restarts, as Lingo's do; upgrade
// when the plugin storage lands (#40). One copy, so a Styles press reads the switches Settings set.
let current: RetouchSettings = defaultSettings;

export function currentSettings(): RetouchSettings {
  return current;
}

export function rememberSettings(next: RetouchSettings): void {
  current = next;
}
