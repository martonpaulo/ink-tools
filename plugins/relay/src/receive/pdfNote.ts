/**
 * A received PDF becomes a new note (#143): each PDF page is rendered to a page-sized PNG, the
 * note is created with page 1 as its background template, and one page per further PDF page is
 * inserted with its PNG. The PDF and the PNGs are removed at the end; a failure also removes the
 * half-made note, and answers one toast line that names the cause.
 */
import {Result, SHARED_ROOT} from '@supernote-tools/sn-adapter/official';
import {copy} from '../copy';
import {Relay} from '../native';
import {TEMP_DIR} from '../send/sendPng';
import type {Size} from './receive';

/** More pages than a scan of study cards needs, and few enough to render in seconds. */
export const MAX_PDF_PAGES = 50;
/** The Manta's page, used when no note is open to measure (`../ink2pic/docs/brief.md`). */
export const DEFAULT_PAGE: Size = {width: 1920, height: 2560};
export const NOTE_DIR = `${SHARED_ROOT}/Note`;
export const PAGES_DIR = `${TEMP_DIR}/pdf-pages`;
/** How many ` 2`, ` 3`… names are tried before giving up on a free one. */
const MAX_NAME_TRIES = 50;

/** The note side of a PDF receive, so the test runs it without a device. */
export type NoteFiles = {
  pageSize(): Promise<Result<Size>>;
  createNote(notePath: string, templatePath: string): Promise<Result<boolean>>;
  insertNotePage(
    notePath: string,
    page: number,
    template: string,
  ): Promise<Result<boolean>>;
};

const two = (n: number) => String(n).padStart(2, '0');

/** `Scan 2026-11-16 0905`, in the tablet's local time. */
export function scanName(at: Date): string {
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  return `Scan ${day} ${two(at.getHours())}${two(at.getMinutes())}`;
}

/** The first free note path for `name`, never an existing note; null when none is found. */
async function freeNotePath(native: Relay, name: string): Promise<string | null> {
  for (let n = 1; n <= MAX_NAME_TRIES; n++) {
    const path = `${NOTE_DIR}/${n === 1 ? name : `${name} ${n}`}.note`;
    const taken = await native.exists(path);
    if (!taken.ok) {
      return null;
    }
    if (!taken.value) {
      return path;
    }
  }
  return null;
}

async function removeAll(native: Relay, paths: string[]): Promise<void> {
  for (const path of paths) {
    await native.remove(path);
  }
}

const done = (r: Result<boolean>) => r.ok && r.value === true;

/** Makes the note from the PDF at `pdfPath`; answers the toast line. */
export async function pdfToNote(
  native: Relay,
  host: NoteFiles,
  pdfPath: string,
  now: () => Date = () => new Date(),
): Promise<string> {
  const measured = await host.pageSize();
  const page = measured.ok ? measured.value : DEFAULT_PAGE;
  const rendered = await native.renderPdf(
    pdfPath,
    PAGES_DIR,
    page.width,
    page.height,
    MAX_PDF_PAGES,
  );
  if (!rendered.ok) {
    await native.remove(pdfPath);
    return rendered.moduleCode === 'PAGES'
      ? copy.pdfTooManyPages(MAX_PDF_PAGES)
      : copy.pdfBroken;
  }
  const pngs = rendered.value;
  // The PNGs first, then their folder, then the PDF: nothing of the receive stays.
  const temporary = [...pngs, PAGES_DIR, pdfPath];
  if (pngs.length === 0) {
    await removeAll(native, temporary);
    return copy.pdfBroken;
  }
  const notePath = await freeNotePath(native, scanName(now()));
  if (notePath === null) {
    await removeAll(native, temporary);
    return copy.pdfNoNote;
  }
  let made = done(await host.createNote(notePath, pngs[0]));
  for (let index = 1; made && index < pngs.length; index++) {
    made = done(await host.insertNotePage(notePath, index, pngs[index]));
  }
  if (!made) {
    await removeAll(native, [notePath, ...temporary]);
    return copy.pdfNoNote;
  }
  await removeAll(native, temporary);
  return copy.receivedPdf(notePath.slice(NOTE_DIR.length + 1), pngs.length);
}
