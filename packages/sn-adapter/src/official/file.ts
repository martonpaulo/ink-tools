/** Note files a plugin makes, rather than the open note it edits (#143, Relay). */
import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {attempt, BAD_ARGUMENT_CODE, fail, fromResponse, ok, Result, THROWN_CODE} from './result';

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

/**
 * The tablet's own page templates, by the name `insertNotePage` takes, such as `style_white`
 * (#451). sn-plugin-lib 0.2.3's `getNoteSystemTemplates` answers a bare list of `{name, vUri, hUri}`,
 * not an `{success, result}` response; an answer that is no list, is empty, or holds an entry with
 * no name is a failure, never an empty list.
 */
export function noteSystemTemplates(): Promise<Result<string[]>> {
  return attempt(
    () => PluginCommAPI.getNoteSystemTemplates(),
    raw => {
      const names = Array.isArray(raw) ? raw.map(item => (item as {name?: unknown} | null)?.name) : [];
      if (names.length === 0 || !names.every(name => typeof name === 'string' && name.length > 0)) {
        return fail(THROWN_CODE, `getNoteSystemTemplates answered no template list: ${JSON.stringify(raw)}`);
      }
      return ok(names as string[]);
    },
  );
}

/** A page's background as the note names it (sn-plugin-lib 0.2.3 `NoteTemplateInfo`). */
export type PageTemplate = {name: string; md5: string};

/**
 * The background of page `page` (from 0) of the note at `notePath` (`getNotePageTemplate`, #386). A
 * page inserted with a PNG of `MyStyle/` reads `user_<file name>` [measured, #377], so Puzzles names
 * each page PNG by its puzzle code and finds the puzzle of a page again from its background. An
 * answer with no name is a failure, never an empty name.
 */
export function pageTemplate(notePath: string, page: number): Promise<Result<PageTemplate>> {
  return attempt(
    () => PluginFileAPI.getNotePageTemplate(notePath, page),
    raw => {
      const answer = fromResponse<{name?: unknown; md5?: unknown} | null>(raw);
      if (!answer.ok) {
        return answer;
      }
      const {name, md5} = answer.value ?? {};
      if (typeof name !== 'string' || name.length === 0) {
        return fail(THROWN_CODE, `getNotePageTemplate answered no template name: ${JSON.stringify(raw)}`);
      }
      return ok({name, md5: typeof md5 === 'string' ? md5 : ''});
    },
  );
}
