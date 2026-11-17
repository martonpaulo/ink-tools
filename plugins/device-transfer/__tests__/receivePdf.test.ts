/** A received PDF becomes a note with its pages as backgrounds (#143), with a scripted module. */
import {fail, MODULE_CODE, ok} from '@supernote-tools/sn-adapter/official';
import {copy} from '../src/copy';
import {
  DEFAULT_PAGE,
  MAX_PDF_PAGES,
  NOTE_DIR,
  pagesDir,
  pdfToNote,
  scanName,
  NoteFiles,
} from '../src/receive/pdfNote';
import {receiveOne, NoteHost} from '../src/receive/receive';
import {fakeRelay} from '../test-support/fakeRelay';

const PDF = '/tmp/received-sess.pdf';
const AT = new Date(2026, 10, 16, 9, 5);
const NOTE = `${NOTE_DIR}/Scan 2026-11-16 0905.note`;
const PAGES_DIR = pagesDir(PDF);
const PNGS = [`${PAGES_DIR}/page-1.png`, `${PAGES_DIR}/page-2.png`];

function files(overrides: Partial<NoteFiles> = {}) {
  const host: NoteFiles = {
    pageSize: jest.fn(async () => ok({width: 1404, height: 1872})),
    createNote: jest.fn(async () => ok(true)),
    insertNotePage: jest.fn(async () => ok(true)),
    ...overrides,
  };
  return host;
}

const run = (api: Parameters<typeof pdfToNote>[0], host: NoteFiles) =>
  pdfToNote(api, host, PDF, () => AT);

test('the note name is the scan time, in local time', () => {
  expect(scanName(AT)).toBe('Scan 2026-11-16 0905');
});

test('each PDF page becomes a page whose background is that page, then nothing stays', async () => {
  const {api, native, calls} = fakeRelay();
  const host = files();
  await expect(run(api, host)).resolves.toBe(copy.receivedPdf('Scan 2026-11-16 0905.note', 2));
  expect(native.renderPdf).toHaveBeenCalledWith(PDF, PAGES_DIR, 1404, 1872, MAX_PDF_PAGES);
  expect(host.createNote).toHaveBeenCalledWith(NOTE, PNGS[0]);
  expect(host.insertNotePage).toHaveBeenCalledWith(NOTE, 1, PNGS[1]);
  expect(calls.removed).toEqual([...PNGS, PAGES_DIR, PDF]);
});

test('with no note open the page is the default size', async () => {
  const {api, native} = fakeRelay();
  await run(api, files({pageSize: async () => fail(1, 'no note')}));
  expect(native.renderPdf).toHaveBeenCalledWith(
    PDF,
    PAGES_DIR,
    DEFAULT_PAGE.width,
    DEFAULT_PAGE.height,
    MAX_PDF_PAGES,
  );
});

test('a name already taken gets the next free one, never an overwrite', async () => {
  const taken = new Set([NOTE, `${NOTE_DIR}/Scan 2026-11-16 0905 2.note`]);
  const {api} = fakeRelay({exists: jest.fn(async (path: string) => taken.has(path))});
  const host = files();
  await run(api, host);
  expect(host.createNote).toHaveBeenCalledWith(`${NOTE_DIR}/Scan 2026-11-16 0905 3.note`, PNGS[0]);
});

test.each([
  ['a broken PDF or one with no page', 'BROKEN', copy.pdfBroken],
  ['too many pages', 'PAGES', copy.pdfTooManyPages(MAX_PDF_PAGES)],
])('%s is a toast naming it, no note, and the PDF removed', async (_what, code, line) => {
  const {api, calls} = fakeRelay({
    renderPdf: jest.fn(async () => {
      throw Object.assign(new Error(code), {code});
    }),
  });
  const host = files();
  await expect(run(api, host)).resolves.toBe(line);
  expect(host.createNote).not.toHaveBeenCalled();
  expect(calls.removed).toEqual([PDF]);
});

test('an empty page list is a broken PDF', async () => {
  const {api, calls} = fakeRelay({renderPdf: jest.fn(async () => [])});
  await expect(run(api, files())).resolves.toBe(copy.pdfBroken);
  expect(calls.removed).toEqual([PAGES_DIR, PDF]);
});

test('a refused note leaves no note, PNG or PDF behind', async () => {
  const {api, calls} = fakeRelay();
  const host = files({createNote: jest.fn(async () => ok(false))});
  await expect(run(api, host)).resolves.toBe(copy.pdfNoNote);
  expect(host.insertNotePage).not.toHaveBeenCalled();
  expect(calls.removed).toEqual([NOTE, ...PNGS, PAGES_DIR, PDF]);
});

test('a failure on a later page removes the half-made note', async () => {
  const {api, calls} = fakeRelay();
  const host = files({insertNotePage: jest.fn(async () => fail(MODULE_CODE, 'no page'))});
  await expect(run(api, host)).resolves.toBe(copy.pdfNoNote);
  expect(calls.removed).toEqual([NOTE, ...PNGS, PAGES_DIR, PDF]);
});

test('a PDF that arrives over LocalSend goes to a note, not into the open one', async () => {
  const {api, calls} = fakeRelay({}, [
    {
      kind: 'offer',
      body: JSON.stringify({files: {p: {fileType: 'application/pdf', size: 100}}}),
      sessionId: 'sess',
      token: 'tok',
    },
    {kind: 'file', path: PDF},
  ]);
  const host: NoteHost = {
    ...files(),
    permissions: async () => null,
    pluginDir: async () => ok('/plugin'),
    pageKey: async () => ok('/note.note#0'),
    occupied: async () => ok({rects: [], complete: true}),
    log: () => {},
    closeView: async () => ok(true),
    insertText: jest.fn(async () => ok(true)),
    lasso: async () => ok(true),
    insertImage: jest.fn(async () => ok(true)),
  };
  const line = await receiveOne(api, host, 'Supernote');
  expect(line).toMatch(/^Scan .* made with 2 pages$/);
  expect(calls.answers[0].slice(2)).toEqual(['p', 'pdf']);
  expect(host.insertImage).not.toHaveBeenCalled();
  expect(calls.stopped).toBe(1);
});
