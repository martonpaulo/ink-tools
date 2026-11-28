/** A scripted note for the receive tests (#49, #289, #493): a page open, empty, every call succeeding. */
import {ok} from '@ink-tools/sn-adapter/official';
import type {NoteHost} from '../src/receive/receive';

export const FAKE_PAGE = {width: 1404, height: 1872};
/** A received photo's own size, as measured on the tablet (#196). */
export const FAKE_PICTURE = {width: 923, height: 1200};

export function fakeNote(overrides: Partial<NoteHost> = {}): NoteHost {
  return {
    permissions: jest.fn(async () => null),
    pluginDir: jest.fn(async () => ok('/plugin')),
    pageKey: jest.fn(async () => ok('/note.note#0')),
    pageSize: jest.fn(async () => ok(FAKE_PAGE)),
    occupied: jest.fn(async () => ok({rects: [], complete: true})),
    log: jest.fn(),
    closeView: jest.fn(async () => ok(true)),
    insertText: jest.fn(async () => ok(true)),
    lasso: jest.fn(async () => ok(true)),
    insertImage: jest.fn(async () => ok(true)),
    imageSize: jest.fn(async () => ok(FAKE_PICTURE)),
    wait: jest.fn(async () => {}),
    createNote: jest.fn(async () => ok(true)),
    insertNotePage: jest.fn(async () => ok(true)),
    ...overrides,
  };
}
