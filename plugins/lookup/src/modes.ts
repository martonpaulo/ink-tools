/**
 * Lookup's picture modes (#111): one lasso button each, chosen before the search, never a toggle
 * after it (AGENTS.md › Rules). This is the one owner of each mode's button id, name, Settings key
 * and search style, and of the translation buttons' ids; the button registration and Settings read
 * them from here. The names follow the wording of Supernote's own lasso menu («New Sticker»): a
 * verb and a noun in title case (owner, 2026-11-16, #167).
 */
import {
  ALL_DIRECTIONS,
  Direction,
  directionId,
} from '@supernote-tools/ink-core';
import type {PictureMode, SourceAdapter} from '@supernote-tools/picture-search';
import {copy} from './copy';

/**
 * The first button id of Lookup: Ink2Pic's ids run from 100 to 901, and both plugins stay
 * installed until Ink2Pic is retired (owner D40), so Lookup keeps its own range.
 */
export const FIRST_BUTTON_ID = 1000;

export type Mode = {
  kind: PictureMode;
  buttonId: number;
  /** The lasso button's name. */
  name: string;
  /** Its opt-in switch in Settings. */
  settingKey: 'illustration' | 'photo';
  /**
   * The search's «Photos too» context (#70): false asks Commons for drawings first, true for every
   * picture at once.
   */
  photos: boolean;
  /** The sources this mode leaves out, by adapter name. */
  skipSources: readonly string[];
  /**
   * The picture goes in as a Supernote sticker, through the SDK's `insertSticker`, so it can be
   * used again; else as a picture (#35, owner D32 A).
   */
  sticker: boolean;
  /** Its lasso button's icon file in `assets/` (#107, `src/icons.ts`). */
  icon: string;
};

export const MODES: readonly Mode[] = [
  {
    // Drawings, engravings and OpenMoji: Ink2Pic's «Drawings» style, line art first.
    kind: 'illustration',
    buttonId: FIRST_BUTTON_ID,
    name: 'Insert Sticker',
    settingKey: 'illustration',
    photos: false,
    skipSources: [],
    sticker: true,
    icon: 'sticker.png',
  },
  {
    // Real photos: Commons with no drawings filter; clip art and symbols are no photos.
    kind: 'photo',
    buttonId: FIRST_BUTTON_ID + 1,
    name: 'Insert Image',
    settingKey: 'photo',
    photos: true,
    skipSources: ['openclipart', 'openmoji'],
    sticker: false,
    icon: 'image.png',
  },
];

/**
 * «Choose Image» (#156): after the picture modes and «Insert Definition», whose id is
 * FIRST_BUTTON_ID + MODES.length (src/definition.ts).
 */
export const CHOOSE_BUTTON_ID = FIRST_BUTTON_ID + MODES.length + 1;
export const CHOOSE_BUTTON_NAME = 'Choose Image';

/** One translation button: its direction, its Settings key and its id and name. */
export type Translation = {
  direction: Direction;
  /** Its key in the Settings' `directions` map. */
  key: string;
  buttonId: number;
  name: string;
  /** Its lasso button's icon file in `assets/`, one per direction (#107, `src/icons.ts`). */
  icon: string;
};

/**
 * One «Translate ES→PT» button per direction (#174), after «Choose Image»: the first id is #158's
 * «Insert translation», and each direction keeps its place in `ALL_DIRECTIONS`, so a new pair adds
 * ids after the others and never moves one.
 */
export const TRANSLATIONS: readonly Translation[] = ALL_DIRECTIONS.map(
  (direction, index) => ({
    direction,
    key: directionId(direction),
    buttonId: CHOOSE_BUTTON_ID + 1 + index,
    name: copy['button.translate'](direction),
    icon: `translate-${directionId(direction)}.png`,
  }),
);

/** The sources a mode searches, in the registry's order. */
export function modeAdapters(
  mode: Mode,
  adapters: readonly SourceAdapter[],
): SourceAdapter[] {
  return adapters.filter(adapter => !mode.skipSources.includes(adapter.name));
}
