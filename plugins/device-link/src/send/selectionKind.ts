/**
 * How «Send Selection» sends by default (#307): as text when the lasso is plain handwriting, as an
 * image when it holds drawings or arrows. It only preselects: the person can switch at any time
 * (owner, 2026-11-26, `docs/plugin-scope.md` › Rules for every feature).
 */
import {STROKE_TYPE} from '@ink-tools/sn-adapter/official';

export type SendKind = 'text' | 'image';

/** The lasso read for the choice: the recognized text ('' when none) and the preselected kind. */
export type SelectionRead = {text: string; kind: SendKind};

/** Arrow marks a recognizer gives for a drawn arrow. */
const ARROWS = /[←-⇿⟵-⟿]|->|<-|=>|<=/;

/** Below this share of letters and digits among the visible characters, the lasso is a drawing. */
export const TEXT_SHARE = 0.7;

/**
 * `text` for strokes alone whose recognition is mostly letters and digits, with no arrow; else
 * `image`: a picture, a shape, a text box, nothing recognized, or marks such as arrows.
 *
 * shortcut: reads only the element types and the recognized text, so a drawing of plain strokes
 * that the recognizer turns into letters preselects text; upgrade to a per-stroke shape rule (as
 * ink-core's `conversion/shapes.ts`) when a device round shows a wrong default.
 */
export function preselect(elements: ReadonlyArray<{type?: unknown}>, text: string): SendKind {
  const visible = text.replace(/\s/g, '');
  if (visible === '' || elements.some(each => each.type !== STROKE_TYPE) || ARROWS.test(text)) {
    return 'image';
  }
  const letters = visible.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return letters / visible.length >= TEXT_SHARE ? 'text' : 'image';
}
