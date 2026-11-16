/** Note files a plugin makes, rather than the open note it edits (#143, Relay). */
import {PluginFileAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';

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
 * Inserts page `page` (0-based, as `getCurrentPageNum` counts) into the note, with `template` as
 * its background (#143). The SDK calls `template` a page template name; whether a PNG path works
 * is TO TEST on the device.
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
