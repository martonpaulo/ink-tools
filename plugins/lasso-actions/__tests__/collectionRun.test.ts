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
      return ok(true);
    },
    resize: async rect => {
      calls.push(`move ${rect.left},${rect.top},${rect.right},${rect.bottom}`);
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
    log: line => logs.push(line),
    ...over,
  };
  return {
    host,
    logs,
    files,
    calls,
    toasts,
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
  expect(failing.toasts).toEqual([copy['collection.notSaved']]);
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
  expect(fake.toasts).toEqual([
    copy['collection.noLasso'],
    copy['error.unplaced'],
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
    // The view closes first; each piece is then moved right after its paste (#249).
    'close view',
    `insert ${DIR}/collection-1_100_200_200_60.sticker`,
    'move 100,200,300,260',
    `insert ${DIR}/collection-2_500_900_300_100.sticker`,
    'move 500,900,800,1000',
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
  fake.host.insertSticker = async () =>
    ++inserts === 2 ? fail(205, 'refused') : ok(true);
  expect(await pasteCollection(fake.host, false)).toEqual({
    ok: false,
    why: 'insert',
  });
  expect(fake.toasts.at(-1)).toBe(copy['collection.notPasted'](1));
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
  expect(fake.toasts.at(-1)).toBe(copy['collection.notPasted'](0));
  expect(await countPieces(fake.host)).toBe(1);
});

/**
 * The Manta as device rounds 6 and 7 recorded it (#249): `insertSticker` leaves the piece at the
 * page centre in the pasted state. While the plugin view is in front, no lasso call reaches it:
 * `resizeLassoRect` answers 904 and `lassoElements` at the page centre answers false. With no view
 * in front, NOTE lassoes the pasted piece about 250 ms after `insertSticker` answers, and a
 * `resizeLassoRect` before that answers 904 too, in about 6 ms (device round 9): some asks refused.
 */
const MANTA_REFUSED_ASKS = 40;

function mantaPage(fake: ReturnType<typeof fakeHost>) {
  let viewOpen = true;
  let pasted = false;
  let refusals = 0;
  const placed: string[] = [];
  Object.assign(fake.host, {
    closeView: async () => {
      viewOpen = false;
      return ok(true);
    },
    insertSticker: async (path: string) => {
      pasted = true;
      refusals = MANTA_REFUSED_ASKS;
      placed.push(path.slice(DIR.length + 1));
      return ok(true);
    },
    resize: async () => {
      if (!viewOpen && pasted && refusals > 0) {
        refusals -= 1;
        return fail(904, 'No lasso action has been performed. Cannot call the API!');
      }
      if (viewOpen || !pasted) {
        return fail(904, 'No lasso action has been performed. Cannot call the API!');
      }
      pasted = false;
      return ok(true);
    },
    select: async () => ok(!viewOpen && !pasted),
  });
  return placed;
}

test('on the Manta two pieces both go in once the view is closed (#249)', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  fake.lassoAt(ok({left: 500, top: 900, right: 800, bottom: 1000}));
  await addToCollection(fake.host, false);
  const placed = mantaPage(fake);
  expect(await pasteCollection(fake.host, false)).toEqual({ok: true, count: 0});
  expect(placed).toEqual([
    'collection-1_100_200_200_60.sticker',
    'collection-2_500_900_300_100.sticker',
  ]);
});

test('on the Manta a move asked before NOTE lassoed the piece is asked again (#249, round 9)', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  mantaPage(fake);
  expect(await pasteCollection(fake.host, false)).toEqual({ok: true, count: 0});
  expect(fake.logs).toContain(`collection paste: move asked again ${MANTA_REFUSED_ASKS} times`);
});

test('a move that never finds a lasso stops within the settle limit', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  let asked = 0;
  fake.host.resize = async () => {
    asked += 1;
    return fail(904, 'No lasso action has been performed. Cannot call the API!');
  };
  expect(await pasteCollection(fake.host, false)).toEqual({ok: false, why: 'insert'});
  expect(asked).toBe(PASTE_SETTLE_TRIES + 1);
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
    'collection paste: collection-1_100_200_200_60.sticker: resizeLassoRect 904 No lasso action has been performed. Cannot call the API!',
  );
});

test('a paste whose pieces cannot be lassoed on the page keeps the collection (#249, round 9)', async () => {
  const fake = fakeHost();
  await addToCollection(fake.host, false);
  await addToCollection(fake.host, false);
  fake.host.select = async () => ok(false);
  expect(await pasteCollection(fake.host, false)).toEqual({ok: false, why: 'unchecked'});
  expect(await countPieces(fake.host)).toBe(2);
  expect(fake.toasts.at(-1)).toBe(copy['collection.notChecked']);
});

test('an empty collection pastes nothing and says so', async () => {
  const fake = fakeHost();
  expect(await pasteCollection(fake.host, false)).toEqual({
    ok: false,
    why: 'empty',
  });
  expect(fake.calls).toEqual([]);
  expect(fake.toasts).toEqual([copy['collection.empty']]);
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
  expect(fake.toasts.at(-1)).toBe(copy['collection.notAsked']);
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
