import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {
  attempt,
  EMPTY_LASSO_CODE,
  fail,
  fromResponse,
  ok,
  Result,
  THROWN_CODE,
} from './result';

/**
 * The page and lasso as PNG files, for Relay's sends (#98). Relay's own tests call them.
 */

/** `generateNotePng`'s `type` for a white background; 0 is transparent (sn-plugin-lib 0.2.3). */
export const WHITE_PNG = 1;

/**
 * Writes one page of a note to `pngPath` at the page's own size (`times: 1`), on white, as the
 * page looks on screen. `false` from the host is a failure, never a success.
 */
export function pageImage(
  notePath: string,
  page: number,
  pngPath: string,
): Promise<Result<string>> {
  return attempt(
    () =>
      PluginFileAPI.generateNotePng({
        notePath,
        page,
        times: 1,
        pngPath,
        type: WHITE_PNG,
      }),
    raw => {
      const answer = fromResponse<boolean>(raw);
      if (!answer.ok) {
        return answer;
      }
      return answer.value === true
        ? ok(pngPath)
        : fail(THROWN_CODE, 'the page image was not generated');
    },
  );
}

/**
 * Writes a PNG of only the lassoed elements to `pngPath` (official docs, «generateLassoPreview»)
 * and answers the path the host wrote. No preview, or one with no path, is «nothing selected»
 * (`EMPTY_LASSO_CODE`), never a path to a file that does not exist.
 */
export function lassoImage(pngPath: string): Promise<Result<string>> {
  return attempt(
    () => PluginCommAPI.generateLassoPreview(pngPath),
    raw => {
      const answer = fromResponse<{imagePath?: unknown} | null>(raw);
      if (!answer.ok) {
        return answer;
      }
      const path = answer.value?.imagePath;
      return typeof path === 'string' && path.length > 0
        ? ok(path)
        : fail(EMPTY_LASSO_CODE, 'the lasso gave no preview image');
    },
  );
}
