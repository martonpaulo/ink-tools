/** Collection's pure rules (#249): names round-trip, placements keep relative positions, clamp, union. */
import {
  nextSeq,
  parsePiece,
  pieceName,
  piecesIn,
  placements,
  unionRect,
} from '../src/collection/collection';

const PAGE = {width: 1404, height: 1872};

test('a piece name round-trips its order and page rect', () => {
  const rect = {left: 120, top: 340, right: 520, bottom: 400};
  const name = pieceName(3, rect);
  expect(name).toBe('collection-3_120_340_400_60.sticker');
  expect(parsePiece(name)).toEqual({seq: 3, rect});
});

test('a fractional rect is named in whole pixels', () => {
  expect(
    pieceName(1, {left: 10.4, top: 20.6, right: 110.4, bottom: 70.6}),
  ).toBe('collection-1_10_21_100_50.sticker');
});

test('other files, broken names and pieces with no size are not pieces', () => {
  for (const name of [
    'settings.json',
    'collection-1_2_3_4.sticker',
    'collection-x_1_2_3_4.sticker',
    'collection-1_2_3_0_4.sticker',
    'collection-1_2_3_4_5.png',
  ]) {
    expect(parsePiece(name)).toBeNull();
  }
});

test('a folder lists its pieces in the order they were taken, from bare names or paths', () => {
  const pieces = piecesIn([
    '/plugin/collection-10_0_0_5_5.sticker',
    'settings.json',
    'collection-2_0_0_5_5.sticker',
  ]);
  expect(pieces.map(piece => piece.seq)).toEqual([2, 10]);
  expect(pieces[1].name).toBe('collection-10_0_0_5_5.sticker');
  expect(nextSeq(pieces)).toBe(11);
  expect(nextSeq([])).toBe(1);
});

test('pieces that fit go back where they were taken, each in its place', () => {
  const pieces = [
    {seq: 1, rect: {left: 100, top: 100, right: 300, bottom: 200}},
    {seq: 2, rect: {left: 400, top: 900, right: 700, bottom: 1000}},
  ];
  expect(placements(pieces, PAGE)).toEqual({
    targets: pieces.map(piece => piece.rect),
    union: {left: 100, top: 100, right: 700, bottom: 1000},
  });
});

test('a group past the page edge moves as one, keeping each offset', () => {
  const pieces = [
    {seq: 1, rect: {left: 1200, top: 1700, right: 1400, bottom: 1800}},
    {seq: 2, rect: {left: 1300, top: 1800, right: 1500, bottom: 1900}},
  ];
  const placed = placements(pieces, PAGE);
  expect(placed?.union).toEqual({
    left: 1104,
    top: 1672,
    right: 1404,
    bottom: 1872,
  });
  const [first, second] = placed?.targets ?? [];
  expect(second.left - first.left).toBe(100);
  expect(second.top - first.top).toBe(100);
});

test('a group taken on a larger page starts at the top left of a smaller one', () => {
  const pieces = [
    {seq: 1, rect: {left: 50, top: 50, right: 1500, bottom: 300}},
  ];
  expect(placements(pieces, PAGE)?.targets[0]).toEqual({
    left: 0,
    top: 50,
    right: 1450,
    bottom: 300,
  });
});

test('no piece places nothing, and the union of none is null', () => {
  expect(placements([], PAGE)).toBeNull();
  expect(unionRect([])).toBeNull();
});
