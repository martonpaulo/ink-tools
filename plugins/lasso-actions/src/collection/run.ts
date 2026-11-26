/**
 * Collection's actions (#249): add or cut the lasso into the collection, paste every piece on the
 * current page, clear it, count it. Each runs over a host interface, so the tests use a fake page;
 * `DEVICE_HOST` is the tablet's. A step that fails stops the action and says so; a cut deletes
 * the lassoed ink only after its sticker was written, and a paste empties the collection only after
 * every piece went in.
 */
import {rectProblem, type Rect, type Size} from '@ink-tools/ink-core';
import {
  closePluginView,
  confirm,
  deleteLassoElements,
  fail,
  getLassoRect,
  insertSticker,
  lassoElements,
  NO_LASSO_CODE,
  ok,
  resizeLassoRect,
  Result,
  saveStickerByLasso,
} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import {copy} from '../copy';
import {currentPageSize} from '../pageSize';
import {deleteFile, listDir, pluginFolder} from '../profile';
import {lookupLog, showToast, UNPLACED, whyNot} from '../textBox';
import {working} from '../working';
import {
  nextSeq,
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
  /** Closes the plugin view, so the note is in front while the pieces go in. */
  closeView: () => Promise<Result<boolean>>;
  /** Asks `question` in the host's confirm dialog; true only for `action`. */
  ask: (question: string, action: string, cancel: string) => Promise<Result<boolean>>;
  /** A success line, such as «Added: 2 pieces». */
  toast: (text: string) => void;
  /** Holds a failure on the tablet in ui-kit's Error state, with Close (#438). */
  fail: (problem: Problem) => void;
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
  | 'kept'
  | 'unchecked'
  | 'clear';

const done = (result: Result<boolean>) => result.ok && result.value;

/**
 * `insertSticker` answers before NOTE lassoes the pasted piece: about 250 ms later on the Manta
 * (device round 9, #249). Until then the lasso is the one there before the paste: none, so a move
 * answers 904 (piece 1 took 56 asks), or the piece pasted before it, so a move answers success and
 * moves that piece instead (piece 2 moved piece 1 off its place, and the union lasso then failed).
 * So the paste asks `getLassoRect` again at once until it answers a rect other than the one before
 * the paste, up to this many times: no timer, since a paste waiting on `setTimeout` with the view
 * closed never asked again (device round 9). Each ask is one bridge round trip, about 6 ms.
 */
export const PASTE_SETTLE_TRIES = 80;

const sameRect = (a: Rect, b: Rect) =>
  a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;

/** The lasso now, or null when there is none (904). */
async function currentLasso(host: CollectionHost): Promise<Result<Rect | null>> {
  const rect = await host.lassoRect();
  if (rect.ok) {
    return rect;
  }
  return rect.code === NO_LASSO_CODE ? ok(null) : rect;
}

/**
 * Pastes one piece and moves it to `rect` once NOTE has lassoed it: the lasso differs from
 * `before`, the one read before the paste. Logs how many asks the new lasso took.
 */
async function pasteAndMove(
  host: CollectionHost,
  path: string,
  rect: Rect,
  tag: string,
): Promise<{call: string; result: Result<boolean>}> {
  const before = await currentLasso(host);
  if (!before.ok) {
    return {call: 'getLassoRect', result: before};
  }
  const inserted = await host.insertSticker(path);
  if (!done(inserted)) {
    return {call: 'insertSticker', result: inserted};
  }
  for (let tries = 1; tries <= PASTE_SETTLE_TRIES; tries++) {
    const now = await currentLasso(host);
    if (!now.ok) {
      return {call: 'getLassoRect', result: now};
    }
    if (now.value !== null && (before.value === null || !sameRect(now.value, before.value))) {
      if (tries > 1) {
        host.log(`${tag}: the pasted piece was lassoed after ${tries} asks`);
      }
      return {call: 'resizeLassoRect', result: await host.resize(rect)};
    }
  }
  return {
    call: 'getLassoRect',
    result: fail(NO_LASSO_CODE, `no new lasso after ${PASTE_SETTLE_TRIES} asks`),
  };
}

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

/** Ends an action on a failure, held in the Error state, not a toast alone (#438). */
function stop(
  host: CollectionHost,
  why: CollectionFailure,
  problem: string | Problem,
): CollectionOutcome {
  host.fail(typeof problem === 'string' ? {what: problem} : problem);
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
    return stop(host, 'unplaced', UNPLACED);
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
 * «Paste Collection»: the plugin view closes, then each piece goes on the current page in the
 * order it was taken and moves to its place, the group shifted onto the page as one; then the
 * whole group is lassoed, so the person moves it as one selection. The collection is emptied
 * unless `keep`; a piece that fails stops the paste, keeps the collection whole and logs the call
 * that failed.
 *
 * With the view open, a pasted piece took no lasso call: `resizeLassoRect` answered 904 (device
 * round 6) and the paste stopped after piece 1 with `answered false` once it was lassoed again at
 * the page centre (device round 7). From a lasso row, with no view in front, `resizeLassoRect`
 * right after `insertSticker` moved the piece exactly (docs/supernote.md, #249), so the paste
 * runs that way, moving each piece once NOTE has lassoed it (`pasteAndMove`).
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
  const closed = await host.closeView();
  if (!done(closed)) {
    host.log(`${tag}: closePluginView ${whyNot(closed)}`);
  }
  for (const [index, piece] of listed.pieces.entries()) {
    const path = `${listed.dir}/${piece.name}`;
    const {call, result} = await pasteAndMove(host, path, placed.targets[index], tag);
    if (!done(result)) {
      host.log(`${tag}: ${piece.name}: ${call} ${whyNot(result)}`);
      return stop(host, 'insert', copy['collection.notPasted'](index));
    }
  }
  const selected = await host.select(placed.union);
  const count = listed.pieces.length;
  if (!done(selected)) {
    // The union lasso is the one check that the pieces are on the page: device round 9 lost the
    // first of two pieces, whose second move took the first piece's lasso, and the union lasso
    // answered false. So the collection stays whole unless the pasted pieces can be lassoed.
    host.log(`${tag}: lassoElements ${whyNot(selected)}; the collection is kept`);
    return stop(host, 'unchecked', copy['collection.notChecked']);
  }
  if (keep) {
    host.toast(copy['collection.pasted'](count));
    return {ok: true, count};
  }
  const left = await removePieces(host, listed, tag);
  if (left === 0) {
    host.toast(copy['collection.pasted'](count));
  } else {
    host.fail({what: copy['collection.notCleared'](left)});
  }
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

/**
 * «Clear Collection»: asks in the host's confirm dialog, then deletes every piece; the pieces left
 * when a delete failed. Cancel, Back or a dialog that fails keeps every piece (device round 7: the
 * Clear button deleted them all with no question).
 */
export async function clearCollection(
  host: CollectionHost,
): Promise<CollectionOutcome> {
  const tag = 'collection clear';
  const listed = await listPieces(host, tag);
  if (!listed) {
    return stop(host, 'folder', copy['collection.failed']);
  }
  const count = listed.pieces.length;
  if (count > 0) {
    const answer = await host.ask(
      copy['collection.clearConfirm'](count),
      copy['button.clear'],
      copy['button.cancel'],
    );
    if (!answer.ok) {
      host.log(`${tag}: confirm ${answer.code} ${answer.message}`);
      return stop(host, 'kept', copy['collection.notAsked']);
    }
    if (!answer.value) {
      return {ok: false, why: 'kept'};
    }
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
  closeView: closePluginView,
  ask: confirm,
  toast: showToast,
  fail: problem => working.hold(problem),
  log: lookupLog,
};
