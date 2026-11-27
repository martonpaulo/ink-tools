/** Collection's actions over a fake page (#249): add, cut, paste, keep, clear and the empty collection. */
import {fail, ok, Result} from '@ink-tools/sn-adapter/official';
import type {Rect} from '@ink-tools/ink-core';
import {
  addToCollection,
  clearCollection,
  CollectionHost,
  countPieces,
  PASTE_SETTLE_TRIES,
  pasteCollection,
} from '../src/collection/run';
import {copy} from '../src/copy';

const DIR = '/plugin';
const PAGE = {width: 1404, height: 1872};

/** A fake page and plugin folder: a lasso rect, the files written, and every call in order. */
function fakeHost(over: Partial<CollectionHost> = {}) {
  const files = new Set<string>();
  const calls: string[] = [];
  const toasts: string[] = [];
  /** What each held Error state names (#438). */
  const failures: string[] = [];
  const logs: string[] = [];
  let lasso: Result<Rect> = ok({left: 100, top: 200, right: 300, bottom: 260});
  let answer = true;
  const host: CollectionHost = {
    folder: async () => ok(DIR),
    list: async dir => {
      const names = [...files]
        .filter(path => path.startsWith(`${dir}/`))
        .map(path => path.slice(dir.length + 1));
      return ok(names.length > 0 ? names : null);
    },
    remove: async path => {
      files.delete(path);
      calls.push(`remove ${path}`);
      return ok(true);
    },
    lassoRect: async () => lasso,
    pageSize: async () => ok(PAGE),
    saveSticker: async path => {
      files.add(path);
      calls.push(`save ${path}`);
      return ok(true);
    },
    deleteLasso: async () => {
      calls.push('delete lasso');
      return ok(true);
    },
    insertSticker: async path => {
      calls.push(`insert ${path}`);
      // The pasted piece is lassoed in its own rect, as NOTE does.
      lasso = ok({left: -40, top: calls.length, right: 140, bottom: 181});
      return ok(true);
    },
    resize: async rect => {
      calls.push(`move ${rect.left},${rect.top},${rect.right},${rect.bottom}`);
      lasso = ok(rect);
      return ok(true);
    },
    saveNote: async () => {
      calls.push('save note');
      lasso = fail(904, 'No lasso action has been performed');
      return ok(true);
    },
    select: async rect => {
      calls.push(
        `select ${rect.left},${rect.top},${rect.right},${rect.bottom}`,
      );
      return ok(true);
    },
    closeView: async () => {
      calls.push('close view');
      return ok(true);
    },
    ask: async question => {
      calls.push(`ask ${question}`);
      return ok(answer);
    },
    toast: text => toasts.push(text),
    fail: problem => failures.push(problem.what),
    log: line => logs.push(line),
    ...over,
  };
  return {
    host,
    logs,
    files,
    calls,
    toasts,
    failures,
    lassoAt: (rect: Result<Rect>) => {
      lasso = rect;
    },
    answerWith: (yes: boolean) => {
      answer = yes;
    },
  };
}

test('Add to Collection writes the lasso as the next piece and leaves the page alone', async () => {
  const fake = fakeHost();
  expect(await addToCollection(fake.host, false)).toEqual({ok: true, count: 1});
  fake.lassoAt(ok({left: 500, top: 900, right: 800, bottom: 1000}));
  expect(await addToCollection(fake.host, false)).toEqual({ok: true, count: 2});
  expect(fake.calls).toEqual([
    `save ${DIR}/collection-1_100_200_200_60.sticker`,
    `save ${DIR}/collection-2_500_900_300_100.sticker`,
  ]);
  expect(fake.toasts).toEqual([
    copy['collection.added'](1),
    copy['collection.added'](2),
  ]);
});

test('Cut to Collection deletes the lasso only after the sticker was written', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, true);
  expect(fake.calls).toEqual([
    `save ${DIR}/collection-1_100_200_200_60.sticker`,
    'delete lasso',
  ]);
  const failing = fakeHost({saveSticker: async () => fail(-1, 'disk full')});
  expect(await addToCollection(failing.host, true)).toEqual({
    ok: false,
    why: 'save',
  });
  expect(failing.calls).toEqual([]);
  expect(failing.failures).toEqual([copy['collection.notSaved']]);
});

test('no lasso, or a pasted selection with no page place, adds nothing', async () => {
  const fake = fakeHost();
  fake.lassoAt(fail(904, 'No lasso action has been performed'));
  expect(await addToCollection(fake.host, false)).toEqual({
    ok: false,
    why: 'lasso',
  });
  fake.lassoAt(ok({left: -90, top: -90, right: 90, bottom: 90}));
  expect(await addToCollection(fake.host, true)).toEqual({
    ok: false,
    why: 'unplaced',
  });
  expect(fake.calls).toEqual([]);
  // Each failure holds the Error state, never a toast alone (#438).
  expect(fake.toasts).toEqual([]);
  expect(fake.failures).toEqual([
    copy['collection.noLasso'],
    copy['error.unplacedWhat'],
  ]);
});

test('Paste Collection puts every piece in order at its place, lassoes the group and empties the collection', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  fake.lassoAt(ok({left: 500, top: 900, right: 800, bottom: 1000}));
  await addToCollection(fake.host, true);
  fake.calls.length = 0;
  fake.toasts.length = 0;
  expect(await pasteCollection(fake.host, false)).toEqual({ok: true, count: 0});
  expect(fake.calls).toEqual([
    // The view closes first; each piece is then moved right after its paste and laid on the
    // page by a save before the next one (#249).
    'close view',
    `insert ${DIR}/collection-1_100_200_200_60.sticker`,
    'move 100,200,300,260',
    'save note',
    `insert ${DIR}/collection-2_500_900_300_100.sticker`,
    'move 500,900,800,1000',
    'save note',
    'select 100,200,800,1000',
    `remove ${DIR}/collection-1_100_200_200_60.sticker`,
    `remove ${DIR}/collection-2_500_900_300_100.sticker`,
  ]);
  expect(fake.toasts).toEqual([copy['collection.pasted'](2)]);
  expect(await countPieces(fake.host)).toBe(0);
});

test('with Keep After Paste the collection stays for another paste', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  expect(await pasteCollection(fake.host, true)).toEqual({ok: true, count: 1});
  expect(fake.calls.some(call => call.startsWith('remove'))).toBe(false);
  expect(await countPieces(fake.host)).toBe(1);
});

test('a piece that fails stops the paste and keeps the collection whole', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  await addToCollection(fake.host, false);
  let inserts = 0;
  const insert = fake.host.insertSticker;
  fake.host.insertSticker = async path =>
    ++inserts === 2 ? fail(205, 'refused') : insert(path);
  expect(await pasteCollection(fake.host, false)).toEqual({
    ok: false,
    why: 'insert',
  });
  expect(fake.failures).toEqual([copy['collection.notPasted'](1)]);
  expect(await countPieces(fake.host)).toBe(2);
});

test('a pasted piece that cannot be moved stops the paste, and the log names the call', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  fake.calls.length = 0;
  fake.host.resize = async () => ok(false);
  expect(await pasteCollection(fake.host, false)).toEqual({ok: false, why: 'insert'});
  expect(fake.calls).toEqual(['close view', `insert ${DIR}/collection-1_100_200_200_60.sticker`]);
  expect(fake.logs.at(-1)).toBe(
    'collection paste: collection-1_100_200_200_60.sticker: resizeLassoRect answered false',
  );
  expect(fake.failures).toEqual([copy['collection.notPasted'](0)]);
  expect(await countPieces(fake.host)).toBe(1);
});

/**
 * The Manta as device rounds 6, 7, 9 and 12 and the 2026-11-27 Probe run recorded it (#249):
 * `insertSticker` answers before NOTE lassoes the pasted piece, about 250 ms later, some 56 asks
 * of about 6 ms. Until then the lasso is the one before the paste: none, and a lasso call answers
 * 904, or the piece pasted before, and a move answers success and moves that piece. While the
 * plugin view is in front, NOTE never lassoes the pasted piece. A pasted piece stays a pasted
 * selection after its move, answering its local rect, and the next `insertSticker` drops it from
 * the page; a save lays it on the page and ends the lasso.
 */
const MANTA_ASKS = 56;
const NO_LASSO = fail(904, 'No lasso action has been performed. Cannot call the API!');
/** What `getLassoRect` answers for a pasted piece of 180 by 180, wherever it is. */
const PASTED_RECT = {left: 0, top: 0, right: 180, bottom: 180};

function mantaPage(fake: ReturnType<typeof fakeHost>) {
  let viewOpen = true;
  /** The piece the lasso holds, or null with no lasso; a pasted piece answers PASTED_RECT. */
  let lasso: {piece: string; rect: Rect; pasted: boolean} | null = null;
  let pending: string | null = null;
  let asks = 0;
  /** Where each piece ends, by its file name. */
  const placed = new Map<string, Rect>();
  const settle = () => {
    if (pending !== null && !viewOpen && ++asks >= MANTA_ASKS) {
      lasso = {piece: pending, rect: PASTED_RECT, pasted: true};
      placed.set(pending, {left: 600, top: 800, right: 780, bottom: 980});
      pending = null;
    }
  };
  Object.assign(fake.host, {
    closeView: async () => {
      viewOpen = false;
      return ok(true);
    },
    insertSticker: async (path: string) => {
      if (lasso?.pasted) {
        // The piece pasted before was never laid on the page: the new paste drops it.
        placed.delete(lasso.piece);
      }
      pending = path.slice(DIR.length + 1);
      asks = 0;
      return ok(true);
    },
    lassoRect: async () => {
      settle();
      return lasso === null ? NO_LASSO : ok(lasso.rect);
    },
    resize: async (rect: Rect) => {
      settle();
      if (lasso === null) {
        return NO_LASSO;
      }
      placed.set(lasso.piece, rect);
      if (!lasso.pasted) {
        lasso = {...lasso, rect};
      }
      return ok(true);
    },
    saveNote: async () => {
      lasso = null;
      return ok(true);
    },
    select: async (rect: Rect) =>
      ok([...placed.values()].every(at => at.left >= rect.left && at.right <= rect.right && at.top >= rect.top && at.bottom <= rect.bottom) && placed.size > 0),
  });
  return placed;
}

test('on the Manta each of two pieces moves to its own place (#249, round 9)', async () => {
  // Round 9: piece 2's move answered success on piece 1's lasso and moved piece 1 off its place.
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  fake.lassoAt(ok({left: 500, top: 900, right: 800, bottom: 1000}));
  await addToCollection(fake.host, false);
  const placed = mantaPage(fake);
  expect(await pasteCollection(fake.host, false)).toEqual({ok: true, count: 0});
  expect(Object.fromEntries(placed)).toEqual({
    'collection-1_100_200_200_60.sticker': {left: 100, top: 200, right: 300, bottom: 260},
    'collection-2_500_900_300_100.sticker': {left: 500, top: 900, right: 800, bottom: 1000},
  });
  expect(fake.logs).toContain(`collection paste: the pasted piece was lassoed after ${MANTA_ASKS} asks`);
});

test('on the Manta two pieces of the same size each stay at their own place (#249, round 12)', async () => {
  // Round 12 lost piece 1 to piece 2's paste; with the same size the lasso never told them apart.
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  fake.lassoAt(ok({left: 500, top: 900, right: 680, bottom: 1080}));
  await addToCollection(fake.host, false);
  fake.lassoAt(ok({left: 900, top: 300, right: 1080, bottom: 480}));
  await addToCollection(fake.host, false);
  const placed = mantaPage(fake);
  expect(await pasteCollection(fake.host, false)).toEqual({ok: true, count: 0});
  expect(Object.fromEntries(placed)).toEqual({
    'collection-1_100_200_200_60.sticker': {left: 100, top: 200, right: 300, bottom: 260},
    'collection-2_500_900_180_180.sticker': {left: 500, top: 900, right: 680, bottom: 1080},
    'collection-3_900_300_180_180.sticker': {left: 900, top: 300, right: 1080, bottom: 480},
  });
});

test('a pasted piece the save cannot lay on the page stops the paste and keeps the collection', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  await addToCollection(fake.host, false);
  fake.host.saveNote = async () => fail(-1, 'thrown');
  expect(await pasteCollection(fake.host, false)).toEqual({ok: false, why: 'insert'});
  expect(fake.logs.at(-1)).toBe(
    'collection paste: collection-1_100_200_200_60.sticker: saveCurrentNote -1 thrown',
  );
  expect(await countPieces(fake.host)).toBe(2);
});

test('a pasted piece that is never lassoed stops the paste within the settle limit', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  let asked = 0;
  fake.host.lassoRect = async () => {
    asked += 1;
    return NO_LASSO;
  };
  expect(await pasteCollection(fake.host, false)).toEqual({ok: false, why: 'insert'});
  expect(asked).toBe(PASTE_SETTLE_TRIES + 1);
  expect(fake.calls.some(call => call.startsWith('move'))).toBe(false);
});

test('on the Manta a paste with the view still open stops after piece 1, naming the call', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  await addToCollection(fake.host, false);
  mantaPage(fake);
  fake.host.closeView = async () => fail(-1, 'thrown');
  expect(await pasteCollection(fake.host, false)).toEqual({ok: false, why: 'insert'});
  expect(fake.logs).toContain('collection paste: closePluginView -1 thrown');
  expect(fake.logs.at(-1)).toBe(
    `collection paste: collection-1_100_200_200_60.sticker: getLassoRect 904 no new lasso after ${PASTE_SETTLE_TRIES} asks`,
  );
});

test('a paste whose pieces cannot be lassoed on the page keeps the collection (#249, round 9)', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  await addToCollection(fake.host, false);
  fake.host.select = async () => ok(false);
  expect(await pasteCollection(fake.host, false)).toEqual({ok: false, why: 'unchecked'});
  expect(await countPieces(fake.host)).toBe(2);
  expect(fake.failures).toEqual([copy['collection.notChecked']]);
});

test('an empty collection pastes nothing and says so', async () => {
  const fake = fakeHost();
  expect(await pasteCollection(fake.host, false)).toEqual({
    ok: false,
    why: 'empty',
  });
  expect(fake.calls).toEqual([]);
  expect(fake.failures).toEqual([copy['collection.empty']]);
});

test("Clear Collection deletes every piece, and the folder's other files stay", async () => {
  const fake = fakeHost();
  fake.files.add(`${DIR}/settings.json`);
  await addToCollection(fake.host, false);
  await addToCollection(fake.host, false);
  expect(await clearCollection(fake.host)).toEqual({ok: true, count: 0});
  expect([...fake.files]).toEqual([`${DIR}/settings.json`]);
  expect(fake.calls).toContain(`ask ${copy['collection.clearConfirm'](2)}`);
  expect(fake.toasts.at(-1)).toBe(copy['collection.cleared']);
});

test('Clear Collection asks first, and Cancel keeps every piece (device round 7)', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  await addToCollection(fake.host, false);
  fake.answerWith(false);
  expect(await clearCollection(fake.host)).toEqual({ok: false, why: 'kept'});
  expect(await countPieces(fake.host)).toBe(2);
  expect(fake.calls.some(call => call.startsWith('remove'))).toBe(false);
});

test('a confirm dialog that fails keeps every piece and says so', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  fake.host.ask = async () => fail(-1, 'thrown');
  expect(await clearCollection(fake.host)).toEqual({ok: false, why: 'kept'});
  expect(await countPieces(fake.host)).toBe(1);
  expect(fake.failures).toEqual([copy['collection.notAsked']]);
});

test('a plugin restart between Add and Paste keeps the pieces: they are read from the folder', async () => {
  const before = fakeHost();
  await addToCollection(before.host, false);
  const after = fakeHost();
  before.files.forEach(path => after.files.add(path));
  expect(await countPieces(after.host)).toBe(1);
});

test('an unreadable folder counts as null, never as an empty collection', async () => {
  const fake = fakeHost({folder: async () => fail(-1, 'no folder')});
  expect(await countPieces(fake.host)).toBeNull();
  expect(await clearCollection(fake.host)).toEqual({ok: false, why: 'folder'});
});
