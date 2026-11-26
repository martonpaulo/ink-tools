/** Collection's actions over a fake page (#249): add, cut, paste, keep, clear and the empty collection. */
import {fail, ok, Result} from '@ink-tools/sn-adapter/official';
import type {Rect} from '@ink-tools/ink-core';
import {
  addToCollection,
  clearCollection,
  CollectionHost,
  countPieces,
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
  let lasso: Result<Rect> = ok({left: 100, top: 200, right: 300, bottom: 260});
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
    toast: text => toasts.push(text),
    log: () => {},
    ...over,
  };
  return {
    host,
    files,
    calls,
    toasts,
    lassoAt: (rect: Result<Rect>) => {
      lasso = rect;
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
  expect(fake.toasts.at(-1)).toBe(copy['collection.cleared']);
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
