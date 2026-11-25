/**
 * The calls Headings alone makes (#252): a lasso made a native title and the lasso box resized.
 * Kept apart from lasso.ts and page.ts, whose every wrapper Ink2Pic calls (its sdk-boundary test),
 * as shapes.ts is for Smart Shapes.
 */
import {PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';
import type {Rect} from './lasso';

/** The native title styles (official types, `PluginNoteAPI.setLassoTitle`); `none` removes the title. */
export const TITLE_STYLE = {none: 0, black: 1, lightGrey: 2, darkGrey: 3, shadow: 4} as const;

export type TitleStyle = (typeof TITLE_STYLE)[keyof typeof TITLE_STYLE];

/**
 * Makes the lassoed strokes a native title of `style`, or changes the lassoed title's style
 * (official types, «setLassoTitle»); `true` means it was set.
 */
export function setLassoTitle(style: TitleStyle): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.setLassoTitle({style}));
}

/**
 * Resizes the lasso box to `rect`, in page pixels (official types, «resizeLassoRect»); it moved a
 * pasted piece exactly there [measured, docs/supernote.md], and what it does to a title is #252's
 * device probe. `true` means it was updated.
 */
export function resizeLassoRect(rect: Rect): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.resizeLassoRect(rect));
}
