/**
 * Lookup's picture modes (#111): one lasso button each, chosen before the search, never a toggle
 * after it (AGENTS.md › Rules). This is the one owner of each mode's button id, name, Settings key
 * and search style; the button registration and Settings read them from here.
 *
 * Insert text is #114 and the definition mode #115; they join this list with their issues.
 */
import type {PictureMode, SourceAdapter} from '@supernote-tools/picture-search';

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
};

export const MODES: readonly Mode[] = [
  {
    // Drawings, engravings and OpenMoji: Ink2Pic's «Drawings» style, line art first.
    kind: 'illustration',
    buttonId: FIRST_BUTTON_ID,
    name: 'Insert illustration',
    settingKey: 'illustration',
    photos: false,
    skipSources: [],
  },
  {
    // Real photos: Commons with no drawings filter; clip art and symbols are no photos.
    kind: 'photo',
    buttonId: FIRST_BUTTON_ID + 1,
    name: 'Insert photo',
    settingKey: 'photo',
    photos: true,
    skipSources: ['openclipart', 'openmoji'],
  },
];

/** The sources a mode searches, in the registry's order. */
export function modeAdapters(
  mode: Mode,
  adapters: readonly SourceAdapter[],
): SourceAdapter[] {
  return adapters.filter(adapter => !mode.skipSources.includes(adapter.name));
}
