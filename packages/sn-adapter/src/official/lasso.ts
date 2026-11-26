import {PluginCommAPI} from 'sn-plugin-lib';
import {attempt, fail, fromResponse, Result, THROWN_CODE} from './result';

/** The page rect, owned by ink-core (#109). */
import type {Rect} from '@ink-tools/ink-core';

export type {Rect};

/**
 * The host's answer to a lasso call while no lasso is on the page: «No lasso action has been
 * performed. Cannot call the API!» (measured, Manta, 2026-11-25, #248; docs/supernote.md).
 */
export const NO_LASSO_CODE = 904;

/** Read before anything else: lasso context is ephemeral (brief section 4.8). */
export function getLassoElements(): Promise<Result<object[]>> {
  return attempt(() => PluginCommAPI.getLassoElements());
}

export function getLassoRect(): Promise<Result<Rect>> {
  return attempt(() => PluginCommAPI.getLassoRect());
}

/**
 * Lassoes the elements inside `rect`, in page pixels within the page (official docs,
 * «lassoElements»); `true` means the selection was made.
 */
export function lassoElements(rect: Rect): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.lassoElements(rect));
}

/**
 * Deletes the lassoed elements (official docs, «deleteLassoElements»): only after the person's own
 * tap, for «In place of the word» (#70); `true` means they were deleted.
 */
export function deleteLassoElements(): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.deleteLassoElements());
}

/** The failure for a recognition that succeeded with no text: null on the tablet (#206). */
export const NO_TEXT_MESSAGE = 'recognition gave no text';

/**
 * Uses the device's recognition language; there is no language parameter (brief section 4.5). A
 * success whose result is not a string (null on the tablet, #206) is a failure, so no caller trims
 * a null.
 */
export function recognizeElements(
  elements: object[],
  size: {width: number; height: number},
): Promise<Result<string>> {
  return attempt(
    () => PluginCommAPI.recognizeElements(elements, size),
    response => {
      const text = fromResponse<unknown>(response);
      if (text.ok && typeof text.value !== 'string') {
        return fail(THROWN_CODE, `${NO_TEXT_MESSAGE} (${text.value === null ? 'null' : typeof text.value})`);
      }
      return text as Result<string>;
    },
  );
}
