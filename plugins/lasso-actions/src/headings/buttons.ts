/**
 * Headings' four lasso buttons (#252), «Heading 1» to «Heading 4» (owner, #304): each is on while
 * the module is (src/modules.ts) and runs with no view. Their ids start 1000 after Lookup's
 * first (src/modes.ts), clear of every Lookup id.
 */
import {FILE_READ, FILE_WRITE, type PluginButton} from '../buttons';
import {copy} from '../copy';
import {FIRST_BUTTON_ID} from '../modes';
import {HEADING_LEVELS, type HeadingLevel} from './levels';

export const FIRST_HEADING_ID = FIRST_BUTTON_ID + 1000;

export const HEADING_BUTTONS: readonly (PluginButton & {
  level: HeadingLevel;
})[] = HEADING_LEVELS.map(level => ({
  level,
  id: FIRST_HEADING_ID + level - 1,
  name: copy['button.heading'](level),
  icon: `heading-${level}.png`,
  // The lasso calls need file read (#128); the title is written in the note.
  needs: [FILE_READ, {...FILE_WRITE, reason: copy['permission.heading']}],
}));

/** The level of a Headings button id, or null for another button. */
export function headingLevel(id: number): HeadingLevel | null {
  return HEADING_BUTTONS.find(button => button.id === id)?.level ?? null;
}
