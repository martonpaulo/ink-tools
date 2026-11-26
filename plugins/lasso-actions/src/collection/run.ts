/**
 * Collection's actions (#249): add or cut the lasso into the collection, paste every piece on the
 * current page, clear it, count it. Each runs over a host interface, so the tests use a fake page;
 * `DEVICE_HOST` is the tablet's. A step that fails stops the action and says so; a cut deletes
 * the lassoed ink only after its sticker was written, and a paste empties the collection only after
 * every piece went in.
 */
import {rectProblem, type Rect, type Size} from '@ink-tools/ink-core';
import {
  deleteLassoElements,
  getLassoRect,
  insertSticker,
  lassoElements,
  resizeLassoRect,
  Result,
  saveStickerByLasso,
} from '@ink-tools/sn-adapter/official';
import {copy} from '../copy';
import {currentPageSize} from '../pageSize';
import {deleteFile, listDir, pluginFolder} from '../profile';
import {lookupLog, showToast, whyNot} from '../textBox';
import {
  nextSeq,
  pastedRect,
  pieceName,
  piecesIn,
  placements,
  type Piece,
} from './collection';

export type CollectionHost = {
  /** The private plugin folder, which holds the pieces. */
  folder: () => Promise<Result<string>>;
  /** The folder's file names, or null when it is empty or missing. */
  list: (dir: string) => Promise<Result<string[] | null>>;
  remove: (path: string) => Promise<Result<boolean>>;
  lassoRect: () => Promise<Result<Rect>>;
  pageSize: () => Promise<Result<Size>>;
  saveSticker: (path: string) => Promise<Result<boolean>>;
  deleteLasso: () => Promise<Result<boolean>>;
  insertSticker: (path: string) => Promise<Result<boolean>>;
  resize: (rect: Rect) => Promise<Result<boolean>>;
  select: (rect: Rect) => Promise<Result<boolean>>;
  toast: (text: string) => void;
  log: (line: string) => void;
};

/** How an action ended; `count` is the pieces in the collection afterwards. */
export type CollectionOutcome =
  | {ok: true; count: number}
  | {ok: false; why: CollectionFailure};

export type CollectionFailure =
  | 'folder'
  | 'lasso'
  | 'unplaced'
  | 'save'
  | 'delete'
  | 'empty'
  | 'page'
  | 'insert'
  | 'clear';

const done = (result: Result<boolean>) => result.ok && result.value;

type Listed = {dir: string; pieces: (Piece & {name: string})[]};

async function listPieces(
  host: CollectionHost,
  tag: string,
): Promise<Listed | null> {
  const dir = await host.folder();
  if (!dir.ok) {
    host.log(`${tag}: plugin folder failed: ${dir.code} ${dir.message}`);
    return null;
  }
  const names = await host.list(dir.value);
  if (!names.ok) {
    host.log(`${tag}: list failed: ${names.code} ${names.message}`);
    return null;
  }
  return {dir: dir.value, pieces: piecesIn(names.value ?? [])};
}

function stop(
  host: CollectionHost,
  why: CollectionFailure,
  text: string,
): CollectionOutcome {
  host.toast(text);
  return {ok: false, why};
}

/**
 * «Add to Collection», or «Cut to Collection» with `cut`: the lasso is written as the next piece,
 * named for its page rect; a cut then deletes the lassoed ink, never when the write failed.
 */
export async function addToCollection(
  host: CollectionHost,
  cut: boolean,
): Promise<CollectionOutcome> {
  const tag = cut ? 'collection cut' : 'collection add';
  const rect = await host.lassoRect();
  if (!rect.ok) {
    host.log(`${tag}: lasso failed: ${rect.code} ${rect.message}`);
    return stop(host, 'lasso', copy['collection.noLasso']);
  }
  const page = await host.pageSize();
  const problem = page.ok
    ? rectProblem(rect.value, page.value)
    : `page size failed: ${page.code} ${page.message}`;
  if (problem) {
    // A pasted selection answers its own local rect (#165): its page place is unknown.
    host.log(`${tag}: ${problem}`);
    return stop(host, 'unplaced', copy['error.unplaced']);
  }
  const listed = await listPieces(host, tag);
  if (!listed) {
    return stop(host, 'folder', copy['collection.failed']);
  }
  const path = `${listed.dir}/${pieceName(nextSeq(listed.pieces), rect.value)}`;
  const saved = await host.saveSticker(path);
  if (!done(saved)) {
    host.log(`${tag}: saveStickerByLasso ${whyNot(saved)}`);
    return stop(host, 'save', copy['collection.notSaved']);
  }
  const count = listed.pieces.length + 1;
  if (cut) {
    const deleted = await host.deleteLasso();
    if (!done(deleted)) {
      host.log(`${tag}: deleteLassoElements ${whyNot(deleted)}`);
      return stop(host, 'delete', copy['collection.notCut'](count));
    }
  }
  host.log(`${tag}: ${path}`);
  host.toast(copy['collection.added'](count));
  return {ok: true, count};
}

/**
 * «Paste Collection»: each piece goes on the current page in the order it was taken, is lassoed
 * again where the host pasted it, and moves to its place, the group shifted onto the page as one; then the whole group is lassoed, so the
 * person moves it as one selection. The collection is emptied unless `keep`; a piece that fails
 * stops the paste and keeps the collection whole.
 */
export async function pasteCollection(
  host: CollectionHost,
  keep: boolean,
): Promise<CollectionOutcome> {
  const tag = 'collection paste';
  const listed = await listPieces(host, tag);
  if (!listed) {
    return stop(host, 'folder', copy['collection.failed']);
  }
  if (listed.pieces.length === 0) {
    return stop(host, 'empty', copy['collection.empty']);
  }
  const page = await host.pageSize();
  const placed = page.ok ? placements(listed.pieces, page.value) : null;
  if (!page.ok || !placed) {
    host.log(`${tag}: page size failed`);
    return stop(host, 'page', copy['collection.failed']);
  }
  for (const [index, piece] of listed.pieces.entries()) {
    const path = `${listed.dir}/${piece.name}`;
    // From the view a pasted piece is no lasso the API can use (904 on the tablet, device round 6):
    // lasso it again where the host pasted it, then move it.
    const inserted = await host.insertSticker(path);
    const selected = done(inserted)
      ? await host.select(pastedRect(piece.rect, page.value))
      : inserted;
    const moved = done(selected)
      ? await host.resize(placed.targets[index])
      : selected;
    if (!done(moved)) {
      host.log(`${tag}: ${piece.name}: ${whyNot(moved)}`);
      return stop(host, 'insert', copy['collection.notPasted'](index));
    }
  }
  const selected = await host.select(placed.union);
  if (!done(selected)) {
    host.log(`${tag}: lassoElements ${whyNot(selected)}`);
  }
  const count = listed.pieces.length;
  if (keep) {
    host.toast(copy['collection.pasted'](count));
    return {ok: true, count};
  }
  const left = await removePieces(host, listed, tag);
  host.toast(
    left === 0
      ? copy['collection.pasted'](count)
      : copy['collection.notCleared'](left),
  );
  return {ok: true, count: left};
}

/** Deletes every listed piece; the number of pieces that are still there. */
async function removePieces(
  host: CollectionHost,
  listed: Listed,
  tag: string,
): Promise<number> {
  let left = 0;
  for (const piece of listed.pieces) {
    const removed = await host.remove(`${listed.dir}/${piece.name}`);
    if (!done(removed)) {
      host.log(`${tag}: delete ${piece.name}: ${whyNot(removed)}`);
      left += 1;
    }
  }
  return left;
}

/** «Clear Collection»: every piece is deleted; the pieces left when a delete failed. */
export async function clearCollection(
  host: CollectionHost,
): Promise<CollectionOutcome> {
  const tag = 'collection clear';
  const listed = await listPieces(host, tag);
  if (!listed) {
    return stop(host, 'folder', copy['collection.failed']);
  }
  const left = await removePieces(host, listed, tag);
  if (left > 0) {
    return stop(host, 'clear', copy['collection.notCleared'](left));
  }
  host.toast(copy['collection.cleared']);
  return {ok: true, count: 0};
}

/** The number of pieces in the collection, or null when the folder cannot be read. */
export async function countPieces(
  host: CollectionHost = DEVICE_HOST,
): Promise<number | null> {
  const listed = await listPieces(host, 'collection count');
  return listed ? listed.pieces.length : null;
}

export const DEVICE_HOST: CollectionHost = {
  folder: pluginFolder,
  list: listDir,
  remove: deleteFile,
  lassoRect: getLassoRect,
  pageSize: currentPageSize,
  saveSticker: saveStickerByLasso,
  deleteLasso: deleteLassoElements,
  insertSticker,
  resize: resizeLassoRect,
  select: lassoElements,
  toast: showToast,
  log: lookupLog,
};
