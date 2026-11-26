/**
 * The calls Smart Pen's Smart Shapes alone makes (#253): a geometry insert, a delete by element number and the
 * lasso box state. Kept apart from lasso.ts and page.ts, whose every wrapper Ink2Pic calls (its
 * sdk-boundary test), as elements.ts is for Real-Time Text.
 */
import {PluginCommAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';

/** The lasso box's three states (official docs, «setLassoBoxState»). */
export const LASSO_BOX = {show: 0, hide: 1, remove: 2} as const;

/** Shows, hides or removes the lasso box; `remove` drops the selection, its elements stay (#253). */
export function setLassoBoxState(state: (typeof LASSO_BOX)[keyof typeof LASSO_BOX]): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.setLassoBoxState(state));
}

/**
 * Inserts one geometry (official docs, «insertGeometry»: `GEO_circle`, `GEO_polygon`, …) on the
 * current page, in page pixels; it keeps the note's undo history [community, Snap] (#253).
 */
export function insertGeometry(geometry: object): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.insertGeometry(geometry));
}

/**
 * Deletes elements of the current page by number (official docs, «deletePageElements»). It clears
 * the note's undo history [community, Snap], so a caller uses it only when nothing else can (#253).
 */
export function deletePageElements(numsInPage: number[], page: number, layer?: number): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.deletePageElements(numsInPage, page, layer ?? null));
}
