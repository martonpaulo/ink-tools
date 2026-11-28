/** The note-side calls a received text longer than a page uses (#593), scripted to succeed. */
import {ok} from '@ink-tools/sn-adapter/official';

export function pageInsertHost() {
  return {
    insertTextOnPage: jest.fn(async () => ok(true)),
    insertPage: jest.fn(async () => ok(true)),
    pageTemplate: jest.fn(async () => ok('style_white')),
  };
}
