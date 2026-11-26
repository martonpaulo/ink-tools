/**
 * Collection's pure rules (#249): each collected piece is one host sticker file in the private
 * plugin folder, named for its order and the page rect it was taken from, so the collection
 * survives a restart by listing the folder and needs no index file. A paste keeps the pieces'
 * places relative to each other and moves them together only as far as the page needs.
 */
import type {Rect, Size} from '@ink-tools/ink-core';

/** Every piece's file name starts with it, so the folder's other files are never read as pieces. */
export const PIECE_PREFIX = 'collection-';
export const PIECE_SUFFIX = '.sticker';

/** One collected piece: its order and where it was on its page, in page pixels. */
export type Piece = {seq: number; rect: Rect};

/** `collection-<seq>_<left>_<top>_<width>_<height>.sticker`, every number a whole pixel. */
export function pieceName(seq: number, rect: Rect): string {
  const left = Math.round(rect.left);
  const top = Math.round(rect.top);
  const width = Math.round(rect.right - rect.left);
  const height = Math.round(rect.bottom - rect.top);
  return `${PIECE_PREFIX}${seq}_${left}_${top}_${width}_${height}${PIECE_SUFFIX}`;
}

const NAME = new RegExp(
  `^${PIECE_PREFIX}(\\d+)_(\\d+)_(\\d+)_(\\d+)_(\\d+)\\${PIECE_SUFFIX}$`,
);

/** The piece a file name stands for, or null for any other file or a piece with no size. */
export function parsePiece(name: string): Piece | null {
  const match = NAME.exec(name);
  if (!match) {
    return null;
  }
  const [seq, left, top, width, height] = match.slice(1).map(Number);
  if (width === 0 || height === 0) {
    return null;
  }
  return {seq, rect: {left, top, right: left + width, bottom: top + height}};
}

/** The pieces among a folder's names (a bare name or a full path), in the order they were taken. */
export function piecesIn(names: readonly string[]): (Piece & {name: string})[] {
  return names
    .map(path => path.slice(path.lastIndexOf('/') + 1))
    .flatMap(name => {
      const piece = parsePiece(name);
      return piece ? [{...piece, name}] : [];
    })
    .sort((a, b) => a.seq - b.seq);
}

/** The order number for the next piece: one past the highest, so a name is never reused. */
export function nextSeq(pieces: readonly Piece[]): number {
  return pieces.reduce((top, piece) => Math.max(top, piece.seq), 0) + 1;
}

/** The smallest rect holding every rect; null for none. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) {
    return null;
  }
  return rects.reduce((all, rect) => ({
    left: Math.min(all.left, rect.left),
    top: Math.min(all.top, rect.top),
    right: Math.max(all.right, rect.right),
    bottom: Math.max(all.bottom, rect.bottom),
  }));
}

/** How far the group must move on one axis to fit between 0 and `size`: none when it fits. */
function shift(start: number, end: number, size: number): number {
  if (start < 0 || end - start > size) {
    return -start;
  }
  return end > size ? size - end : 0;
}

/**
 * Where each piece goes on a page of `page` size, in the pieces' order, and the rect around them
 * all. The pieces move together by one offset, so each keeps its place relative to the others;
 * the offset is zero when they all fit where they were taken, else the least that brings the
 * group onto the page (a group larger than the page starts at its top left corner).
 */
export function placements(
  pieces: readonly Piece[],
  page: Size,
): {targets: Rect[]; union: Rect} | null {
  const union = unionRect(pieces.map(piece => piece.rect));
  if (!union) {
    return null;
  }
  const dx = shift(union.left, union.right, page.width);
  const dy = shift(union.top, union.bottom, page.height);
  const move = (rect: Rect): Rect => ({
    left: rect.left + dx,
    top: rect.top + dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
  });
  return {targets: pieces.map(piece => move(piece.rect)), union: move(union)};
}

/**
 * Where `insertSticker` pastes a piece: its own size at the page centre [measured,
 * docs/supernote.md, #249]. The paste then has no lasso a later call can use, so the paste lassoes
 * this rect again before it moves the piece (the lasso rule of docs/supernote.md).
 */
export function pastedRect(piece: Rect, page: Size): Rect {
  const width = piece.right - piece.left;
  const height = piece.bottom - piece.top;
  const left = Math.round((page.width - width) / 2);
  const top = Math.round((page.height - height) / 2);
  return {left, top, right: left + width, bottom: top + height};
}
