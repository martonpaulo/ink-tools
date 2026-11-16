/**
 * Retouch's edits (#136): each one is a lasso button and a switch in Settings. A new edit is one
 * row here; the buttons and the Settings view follow it.
 */
import {copy} from './copy';

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
  | 'document';

export type EditDefinition = {id: EditId; buttonId: number; name: string};

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
];

export const EDITS: readonly EditDefinition[] = ORDER.map((id, index) => ({
  id,
  buttonId: FIRST_BUTTON_ID + index,
  name: copy[`edit.${id}`],
}));

export type RetouchSettings = {edits: Record<EditId, boolean>};

/** Every edit starts on: the plugin exists for them, and none needs a permission. */
export const defaultSettings: RetouchSettings = {
  edits: Object.fromEntries(ORDER.map(id => [id, true])) as Record<
    EditId,
    boolean
  >,
};

export function setEdit(
  settings: RetouchSettings,
  id: EditId,
  on: boolean,
): RetouchSettings {
  return {edits: {...settings.edits, [id]: on}};
}

export function enabledEdits(settings: RetouchSettings): EditDefinition[] {
  return EDITS.filter(edit => settings.edits[edit.id]);
}

/** The edit a pressed button stands for, or null for an id that is not Retouch's. */
export function editOfButton(id: number): EditDefinition | null {
  return EDITS.find(edit => edit.buttonId === id) ?? null;
}
