/** Note files a plugin makes, rather than the open note it edits (#143, Relay). */
import {PluginFileAPI} from 'sn-plugin-lib';
import {attempt, BAD_ARGUMENT_CODE, fail, Result} from './result';

/**
 * Creates a portrait note at `notePath` whose first page has the PNG at `templatePath` as its
 * background (#143). sn-plugin-lib 0.2.3 names `template` a path; on the device it is TO TEST.
 */
export function createNote(
  notePath: string,
  templatePath: string,
): Promise<Result<boolean>> {
  return attempt(() =>
    PluginFileAPI.createNote({
      notePath,
      template: templatePath,
      mode: 0,
      isPortrait: true,
    }),
  );
}

/**
 * Inserts a new page into the note with `template` as its background (#143): a system template
 * name, or the full path of a PNG in `MyStyle/` (#377). `page` is the index, from 0, that the new
 * page takes; the page there and every later one move down by one. So `page` 0 puts it before
 * the first page (device round 11, #379); `insertPageAfter` names the usual case.
 */
export function insertNotePage(
  notePath: string,
  page: number,
  template: string,
): Promise<Result<boolean>> {
  return attempt(() =>
    PluginFileAPI.insertNotePage({notePath, page, template}),
  );
}

/**
 * Inserts a new page right after page `current` (from 0, as `getCurrentPageNum` counts), the
 * place a Puzzles game page goes (#376): the new page takes index `current + 1` (#379).
 */
export function insertPageAfter(
  notePath: string,
  current: number,
  template: string,
): Promise<Result<boolean>> {
  if (!Number.isInteger(current) || current < 0) {
    return Promise.resolve(fail(BAD_ARGUMENT_CODE, `the current page counts from 0, not ${current}`));
  }
  return insertNotePage(notePath, current + 1, template);
}
