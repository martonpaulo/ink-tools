/** One receive (#49): from the offer to the note, with a scripted module and note. */
import {inkUnderRect, isFree, PAGE_BAR_PX} from '@ink-tools/ink-core';
import {fail, MODULE_CODE, ok} from '@ink-tools/sn-adapter/official';
import {copy} from '../src/copy';
import {refusedProblem} from '../src/permissions';
import {
  addedRect,
  centredRect,
  PAGE_SETTLE_MS,
  PLACED_RETRY_MS,
  PLACED_WAIT_MS,
  freeTextBox,
  boundedPage,
  NoteHost,
  receiveOne,
  resetPlacedForTests,
  textBox,
  pagesOf,
  wrapLines,
} from '../src/receive/receive';
import {receiveState, runReceive} from '../src/receive/session';
import {fakeRelay} from '../test-support/fakeRelay';
import {pageInsertHost} from '../test-support/pageInsert';

const PAGE = {width: 1404, height: 1872};

beforeEach(resetPlacedForTests);

function note(overrides: Partial<NoteHost> = {}) {
  const host: NoteHost = {
    permissions: jest.fn(async () => null),
    canDelete: async () => true,
    pluginDir: jest.fn(async () => ok('/plugin')),
    pageKey: jest.fn(async () => ok('/note.note#0')),
    pageSize: jest.fn(async () => ok(PAGE)),
    occupied: jest.fn(async () => ok({rects: [], complete: true})),
    log: jest.fn(),
    closeView: jest.fn(async () => ok(true)),
    insertText: jest.fn(async () => ok(true)),
    ...pageInsertHost(),
    lasso: jest.fn(async () => ok(true)),
    insertImage: jest.fn(async () => ok(true)),
    // The element insert fails by default, so a test reaches the host's own placement unless it opts in (#540).
    insertImageAt: jest.fn(async () => fail(-1, 'no element insert in this test')),
    imageSize: jest.fn(async () => ok({width: 923, height: 1200})),
    wait: jest.fn(async () => {}),
    createNote: jest.fn(async () => ok(true)),
    insertNotePage: jest.fn(async () => ok(true)),
    ...overrides,
  };
  return host;
}

const offer = (files: Record<string, unknown>) => ({
  kind: 'offer' as const,
  body: JSON.stringify({info: {alias: 'iPhone'}, files}),
  sessionId: 'sess',
  token: 'tok',
});

test('a text lands as a selected text box, and the receiver stops', async () => {
  const {api, calls} = fakeRelay({}, [
    offer({t: {fileType: 'text/plain', preview: 'Buy milk'}}),
  ]);
  const host = note();
  const ready = jest.fn();
  await expect(receiveOne(api, host, 'Supernote', ready)).resolves.toBe(copy.receivedText);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(calls.answers).toEqual([[204, '', null, null]]);
  const rect = textBox(PAGE, 'Buy milk');
  expect(host.insertText).toHaveBeenCalledWith({text: 'Buy milk', rect, fontSize: 32});
  expect(host.lasso).toHaveBeenCalledWith(rect);
  expect(calls.stopped).toBe(1);
  // Our info names the certificate's fingerprint, never a random one.
  expect(String(calls.started[0][4])).toContain('cert-fp');
});

const imageArrives = (path: string) => [
  offer({f: {fileType: 'image/png', size: 100}}),
  {kind: 'file' as const, path},
];

/** A page read before the insert and one after it, which holds the placed picture too. */
function pageReads(before: Rect[], placed: Rect, complete = true) {
  const reads = [
    ok({rects: before, complete}),
    ok({rects: [...before, placed], complete}),
  ];
  return jest.fn(async () => reads.shift() ?? ok({rects: [...before, placed], complete}));
}

type Rect = ReturnType<typeof textBox>;
const PLACED: Rect = {left: 498, top: 680, right: 1421, bottom: 1880};

test('an image is answered with a session, inserted when it arrives, and kept until the next receive', async () => {
  const {api, calls} = fakeRelay({}, imageArrives('/tmp/received-sess.png'));
  const host = note();
  await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(copy.receivedImage);
  expect(calls.answers[0][0]).toBe(200);
  expect(calls.answers[0].slice(2)).toEqual(['f', 'png']);
  expect(host.insertImage).toHaveBeenCalledWith('/tmp/received-sess.png');
  expect(host.insertText).not.toHaveBeenCalled();
  // #196: the host may still read the file when the note saves the floating picture.
  expect(calls.removed).toEqual([]);
  const next = fakeRelay({}, imageArrives('/tmp/received-next.png'));
  await receiveOne(next.api, note(), 'Supernote');
  expect(next.calls.removed).toEqual(['/tmp/received-sess.png']);
});

describe('a received item never covers the writing, and is lassoed alone (#540)', () => {
  test('a picture goes to a free place when the page centre holds writing, and is lassoed there', async () => {
    const writing = {left: 600, top: 900, right: 800, bottom: 960};
    const host = note({
      occupied: jest.fn(async () => ok({rects: [writing], complete: true})),
      imageSize: jest.fn(async () => ok({width: 400, height: 300})),
      insertImageAt: jest.fn(async () => ok(true)),
    });
    await expect(receiveOne(fakeRelay({}, imageArrives('/tmp/e.png')).api, host, 'Supernote')).resolves.toBe(copy.receivedImage);
    expect(host.insertImage).not.toHaveBeenCalled();
    const [[path, rect]] = (host.insertImageAt as jest.Mock).mock.calls;
    expect(path).toBe('/tmp/e.png');
    expect(isFree(rect, [writing])).toBe(true);
    expect([rect.right - rect.left, rect.bottom - rect.top]).toEqual([400, 300]);
    expect(host.lasso).toHaveBeenCalledWith(rect);
  });

  test('a picture placed to miss the writing stays above the page bar (#577)', async () => {
    // Writing over all but a bottom strip, where a 300 px tall picture fits only by reaching under the bar.
    const writing = {left: 0, top: 0, right: PAGE.width, bottom: PAGE.height - 360};
    const host = note({
      occupied: jest.fn(async () => ok({rects: [writing], complete: true})),
      imageSize: jest.fn(async () => ok({width: 400, height: 300})),
      insertImageAt: jest.fn(async () => ok(true)),
    });
    await receiveOne(fakeRelay({}, imageArrives('/tmp/g.png')).api, host, 'Supernote');
    const [[, rect]] = (host.insertImageAt as jest.Mock).mock.calls;
    expect(rect.bottom).toBeLessThanOrEqual(PAGE.height - PAGE_BAR_PX);
  });

  test('an element insert the host refuses falls back to its own placement', async () => {
    const host = note({occupied: pageReads([], PLACED)});
    await receiveOne(fakeRelay({}, imageArrives('/tmp/f.png')).api, host, 'Supernote');
    expect(host.insertImage).toHaveBeenCalledWith('/tmp/f.png');
    expect(host.log).toHaveBeenCalledWith('receive: the picture element was not inserted: insertImage places it');
    expect(host.lasso).toHaveBeenCalledWith(PLACED);
  });

  test('a received text is lassoed by its text box\'s own frame, as the host stored it', async () => {
    const asked = textBox(PAGE, 'Buy milk');
    const frame = {left: asked.left, top: asked.top, right: asked.left + 180, bottom: asked.top + 44};
    const host = note({occupied: pageReads([], frame)});
    await receiveOne(fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: 'Buy milk'}})]).api, host, 'Supernote');
    expect(host.insertText).toHaveBeenCalledWith({text: 'Buy milk', rect: asked, fontSize: 32});
    expect(host.lasso).toHaveBeenCalledWith(frame);
  });
});

describe('the received picture is lassoed for another plugin\'s rows (#196)', () => {
  test('the one rect the insert added is lassoed, so «Document» acts on the picture', async () => {
    const {api} = fakeRelay({}, imageArrives('/tmp/a.png'));
    const host = note({occupied: pageReads([], PLACED)});
    await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(copy.receivedImage);
    expect(host.lasso).toHaveBeenCalledWith(PLACED);
  });

  test('ink under the picture, a partial read or no new rect leaves it unlassoed, logged', async () => {
    const ink = {left: 600, top: 700, right: 700, bottom: 760};
    const over = note({occupied: pageReads([ink], PLACED)});
    await receiveOne(fakeRelay({}, imageArrives('/tmp/b.png')).api, over, 'Supernote');
    expect(over.lasso).not.toHaveBeenCalled();
    expect(over.log).toHaveBeenCalledWith('receive: lassoElements skipped, 1 other elements in the rect');

    const partial = note({occupied: pageReads([], PLACED, false)});
    await receiveOne(fakeRelay({}, imageArrives('/tmp/c.png')).api, partial, 'Supernote');
    expect(partial.lasso).not.toHaveBeenCalled();

    const none = note({imageSize: jest.fn(async () => fail(1, 'no decoder'))});
    await receiveOne(fakeRelay({}, imageArrives('/tmp/d.png')).api, none, 'Supernote');
    expect(none.lasso).not.toHaveBeenCalled();
    expect(none.log).toHaveBeenCalledWith(
      'receive: lassoElements skipped, the placed picture is not found on the page',
    );
  });

  test('a picture the host commits late is found by reading the page again, then lassoed', async () => {
    // Beta 8 on the tablet: the reads right after insertImage held 0 elements.
    const reads = [ok({rects: [], complete: true}), ok({rects: [], complete: true}), ok({rects: [], complete: true})];
    const occupied = jest.fn(async () => reads.shift() ?? ok({rects: [PLACED], complete: true}));
    const host = note({occupied, imageSize: jest.fn(async () => ok({width: 10, height: 10}))});
    await receiveOne(fakeRelay({}, imageArrives('/tmp/late.png')).api, host, 'Supernote');
    expect(host.wait).toHaveBeenCalledTimes(2);
    expect(host.wait).toHaveBeenCalledWith(PLACED_RETRY_MS);
    expect(host.lasso).toHaveBeenCalledWith(PLACED);
  });

  test('a picture never seen on the page is lassoed at the centred rect the host places it at', async () => {
    const page = {width: 1920, height: 2560};
    const host = note({pageSize: jest.fn(async () => ok(page))});
    await receiveOne(fakeRelay({}, imageArrives('/tmp/never.png')).api, host, 'Supernote');
    // Bounded: one read before, then one every PLACED_RETRY_MS up to PLACED_WAIT_MS.
    expect(host.wait).toHaveBeenCalledTimes(PLACED_WAIT_MS / PLACED_RETRY_MS);
    expect(host.lasso).toHaveBeenCalledWith(PLACED);
    expect(host.log).toHaveBeenCalledWith(
      `receive: the placed picture is not on the page after ${PLACED_WAIT_MS} ms: lasso its centred rect`,
    );
  });

  test('centredRect matches the tablet and scales a large picture down to the page', () => {
    const page = {width: 1920, height: 2560};
    expect(centredRect(page, {width: 923, height: 1200})).toEqual(PLACED);
    expect(centredRect(page, {width: 3840, height: 2560})).toEqual({left: 0, top: 640, right: 1920, bottom: 1920});
  });

  test('a lasso the host refuses keeps the picture and its received line', async () => {
    const host = note({occupied: pageReads([], PLACED), lasso: jest.fn(async () => ok(false))});
    await expect(
      receiveOne(fakeRelay({}, imageArrives('/tmp/e.png')).api, host, 'Supernote'),
    ).resolves.toBe(copy.receivedImage);
    expect(host.log).toHaveBeenCalledWith('receive: lassoElements did not lasso the placed picture');
  });

  test('addedRect finds only one new rect, on two complete reads', () => {
    const a = {left: 0, top: 0, right: 10, bottom: 10};
    expect(addedRect({rects: [a], complete: true}, {rects: [a, PLACED], complete: true})).toEqual(PLACED);
    expect(addedRect({rects: [], complete: true}, {rects: [a, PLACED], complete: true})).toBeNull();
    expect(addedRect(null, {rects: [PLACED], complete: true})).toBeNull();
  });
});

test('a HEIC photo is refused, the window stays open, and its toast says why', async () => {
  const {api, calls} = fakeRelay({}, [offer({f: {fileType: 'image/heic', size: 9}})]);
  const host = note();
  await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(copy.notAnImage);
  expect(calls.answers[0][0]).toBe(403);
  expect(host.insertImage).not.toHaveBeenCalled();
});

test('a file over the limit is refused with a toast that names the size (#143)', async () => {
  const {api} = fakeRelay({}, [
    offer({p: {fileType: 'application/pdf', size: 31 * 1024 * 1024}}),
  ]);
  await expect(receiveOne(api, note(), 'Supernote')).resolves.toBe(copy.tooLarge);
});

test('the window takes every item until it ends, each line as it lands (#289)', async () => {
  // Device round 11: a picture sent 6 s after a text was refused (403), as the window ended with
  // its first item.
  const {api, calls} = fakeRelay({}, [
    offer({t: {fileType: 'text/plain', preview: 'first'}}),
    ...imageArrives('/tmp/received-two.png'),
    ...imageArrives('/tmp/received-three.png'),
  ]);
  const host = note();
  const lines: string[] = [];
  await expect(receiveOne(api, host, 'Supernote', undefined, undefined, undefined, line => lines.push(line))).resolves.toBe(copy.receivedImage);
  expect(lines).toEqual([copy.receivedText, copy.receivedImage, copy.receivedImage]);
  expect(host.insertText).toHaveBeenCalledTimes(1);
  expect(host.insertImage).toHaveBeenCalledTimes(2);
  expect(calls.stopped).toBe(1);
  expect(calls.removed).toEqual([]);
  const next = fakeRelay();
  await receiveOne(next.api, note(), 'Supernote');
  expect(next.calls.removed).toEqual(['/tmp/received-two.png', '/tmp/received-three.png']);
});

test('«Stop» after an item answers that item, not «Stopped»', async () => {
  const {api} = fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: 'one'}}), {kind: 'stopped'}]);
  await expect(receiveOne(api, note(), 'Supernote')).resolves.toBe(copy.receivedText);
});

test('a refused offer is followed by a good one in the same window', async () => {
  const {api} = fakeRelay({}, [
    offer({a: {fileType: 'text/plain'}, b: {fileType: 'text/plain'}}),
    {kind: 'cancel'},
    offer({t: {fileType: 'text/plain', preview: 'second'}}),
  ]);
  await expect(receiveOne(api, note(), 'Supernote')).resolves.toBe(copy.receivedText);
});

test('the window closes with «Nothing arrived» and Stop with its own line', async () => {
  const quiet = fakeRelay();
  await expect(receiveOne(quiet.api, note(), 'Supernote')).resolves.toBe(copy.nothingArrived);
  expect(quiet.calls.stopped).toBe(1);
  const stopped = fakeRelay({}, [{kind: 'stopped'}]);
  await expect(receiveOne(stopped.api, note(), 'Supernote')).resolves.toBe(copy.receiveStopped);
});

test('a port in use or a missing module is «Could not start receiving»', async () => {
  const busy = fakeRelay({
    startReceive: jest.fn(async () => {
      throw Object.assign(new Error('x'), {code: 'IO'});
    }),
  });
  // Held in the Error state, never a toast alone (#438).
  const held = {problem: {what: copy.receiveFailed}, state: 'error'};
  await expect(receiveOne(busy.api, note(), 'Supernote')).resolves.toEqual(held);
  const noDir = note({pluginDir: jest.fn(async () => fail(-1, 'none'))});
  await expect(receiveOne(fakeRelay().api, noDir, 'Supernote')).resolves.toEqual(held);
});

test('a text with no open note waits for the next open note (#289)', async () => {
  const {api, calls} = fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: 'x'}})]);
  const host = note({pageSize: jest.fn(async () => fail(-1, 'no note'))});
  await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(copy.keptForNote);
  expect(host.insertText).not.toHaveBeenCalled();
  expect(calls.written).toEqual([JSON.stringify([{kind: 'text', text: 'x'}])]);
});

test('with no note open a page read that never answers keeps the text, and the next offer and Stop still go (#289)', async () => {
  const {api, calls} = fakeRelay({}, [
    offer({t: {fileType: 'text/plain', preview: 'x'}}),
    offer({t: {fileType: 'text/plain', preview: 'y'}}),
    {kind: 'stopped' as const},
  ]);
  // The host's answer with no note open: none (the hang seen twice on the Manta). Bounded as the
  // device host is (`src/run.ts`).
  const host = boundedPage(note({pageSize: jest.fn(() => new Promise<never>(() => {}))}));
  await expect(
    receiveOne(api, host, 'Supernote', () => {}, Date.now, null),
  ).resolves.toBe(copy.keptForNote);
  expect(calls.answers).toHaveLength(2);
  // Each kept in turn (this fake reads back no file it wrote).
  expect(calls.written).toEqual([
    JSON.stringify([{kind: 'text', text: 'x'}]),
    JSON.stringify([{kind: 'text', text: 'y'}]),
  ]);
  expect(calls.stopped).toBe(1);
  expect(host.insertText).not.toHaveBeenCalled();
});

test('a failed insert says so', async () => {
  const {api} = fakeRelay({}, [
    offer({f: {fileType: 'image/jpeg', size: 1}}),
    {kind: 'file', path: '/tmp/a.jpg'},
  ]);
  const host = note({insertImage: jest.fn(async () => ok(false))});
  await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(copy.insertFailed);
  expect(host.lasso).not.toHaveBeenCalled();
});

test('the text box is centred, half the page wide, and stays on the page', () => {
  const box = textBox(PAGE, 'short');
  expect(box.right - box.left).toBe(PAGE.width / 2);
  expect(box.left).toBe(PAGE.width / 4);
  const long = textBox(PAGE, 'word '.repeat(5000));
  expect(long.bottom).toBeLessThanOrEqual(PAGE.height);
  expect(long.bottom).toBeGreaterThan(long.top);
});

test('received files go to the private folder, never to shared storage (#164)', async () => {
  const {api, native} = fakeRelay();
  await receiveOne(api, note(), 'Supernote');
  const fileFolder = (native.startReceive as jest.Mock).mock.calls[0][1];
  expect(fileFolder).toBe('/plugin/tmp');
});

test('a refused permission names it and starts nothing (#163)', async () => {
  const {api, native} = fakeRelay();
  const host = note({
    permissions: jest.fn(async () => 'plugin.permission.FILE:WRITE'),
  });
  // The Needs state with the steps that allow it, never a toast alone (#438).
  await expect(receiveOne(api, host, 'Supernote')).resolves.toEqual({
    problem: refusedProblem('plugin.permission.FILE:WRITE'),
    state: 'needs',
  });
  expect(native.startReceive).not.toHaveBeenCalled();
  expect(host.pageSize).not.toHaveBeenCalled();
});

test('a second text on the same page goes below the first (#49)', async () => {
  const text = offer({t: {fileType: 'text/plain', preview: 'one'}});
  const host = note();
  await receiveOne(fakeRelay({}, [text]).api, host, 'Supernote');
  await receiveOne(fakeRelay({}, [text]).api, host, 'Supernote');
  const [first, second] = (host.insertText as jest.Mock).mock.calls.map(c => c[0].rect);
  expect(second.top).toBeGreaterThan(first.bottom);
  const other = note({pageKey: jest.fn(async () => ok('/note.note#1'))});
  await receiveOne(fakeRelay({}, [text]).api, other, 'Supernote');
  expect((other.insertText as jest.Mock).mock.calls[0][0].rect.top).toBe(first.top);
});

test('a text that would not fit below the last one starts at the top again', () => {
  const first = textBox(PAGE, 'short');
  expect(textBox(PAGE, 'short', PAGE.height - 10).top).toBe(first.top);
});

test('a second tap while receiving starts nothing and shows the running receive again (#289)', async () => {
  const {api, calls} = fakeRelay({}, [{kind: 'stopped'}]);
  const show = jest.fn();
  const first = runReceive(api, note(), 'Supernote', show);
  expect(receiveState()).toBe('starting');
  await expect(runReceive(api, note(), 'Supernote', show)).resolves.toBeNull();
  await expect(first).resolves.toBe(copy.receiveStopped);
  // Once for the first tap, once for the second: the view was closed while the receiver ran.
  expect(show).toHaveBeenCalledTimes(2);
  expect(calls.started).toHaveLength(1);
  expect(receiveState()).toBe('idle');
});

describe('a received text keeps clear of the note\'s page bar (#577)', () => {
  const MANTA = {width: 1920, height: 2560};
  test.each([
    ['a long text', 'line\n'.repeat(120), null],
    ['a text after one that ended near the bar', 'one', 2300],
  ])('%s is inserted wholly above the bar', async (_name, preview, after) => {
    const host = note({
      pageSize: jest.fn(async () => ok(MANTA)),
      occupied: jest.fn(async () => ok({rects: [], complete: true})),
    });
    if (after !== null) {
      // The first text of the page ends at `after`; a second goes below it, or back to the top.
      await receiveOne(fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: 'first\n'.repeat(60)}})]).api, host, 'Supernote');
    }
    await receiveOne(fakeRelay({}, [offer({t: {fileType: 'text/plain', preview}})]).api, host, 'Supernote');
    const rects = (host.insertText as jest.Mock).mock.calls.map(call => call[0].rect);
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(rect.bottom).toBeLessThanOrEqual(MANTA.height - PAGE_BAR_PX);
    }
  });
});

describe('a received text longer than the page\'s room goes whole over new pages (#577, #593)', () => {
  const MANTA = {width: 1920, height: 2560};
  /** One page's lines (the box is 960 px wide: 54 characters a line at font size 32). */
  const PER_LINE = 54;
  const words = Array.from({length: 1100}, (_, index) => `w${index}`);
  const long = words.join(' ');
  const wordsOf = (parts: string[]) => parts.join(' ').split(/\s+/);
  const host = (overrides: Partial<NoteHost> = {}) =>
    note({pageSize: jest.fn(async () => ok(MANTA)), occupied: jest.fn(async () => ok({rects: [], complete: true})), ...overrides});

  test('a text three pages long lands whole: two pages are inserted, no line is past any box', async () => {
    expect(pagesOf(MANTA, long).length).toBe(3);
    const h = host();
    const {api, calls} = fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: long}})]);
    const result = await receiveOne(api, h, 'Supernote');
    expect(result).toBe(copy.receivedTextPages(3));
    expect((h.insertPage as jest.Mock).mock.calls).toEqual([
      ['/note.note', 1, 'style_white'],
      ['/note.note', 2, 'style_white'],
    ]);
    const first = (h.insertText as jest.Mock).mock.calls[0][0];
    const more = (h.insertTextOnPage as jest.Mock).mock.calls;
    expect(more.map(call => call[1])).toEqual([1, 2]);
    const boxes = [first, ...more.map(call => call[0])];
    for (const box of boxes) {
      expect(box.rect.bottom).toBeLessThanOrEqual(MANTA.height - PAGE_BAR_PX);
      expect(wrapLines(box.text, PER_LINE).length * 48).toBeLessThanOrEqual(box.rect.bottom - box.rect.top);
    }
    // Every word, in order, and none twice.
    expect(wordsOf(boxes.map(box => box.text))).toEqual(words);
    // The copy saved before the inserts is removed once every piece is in.
    expect(calls.written).toEqual([long]);
    expect(calls.removed).toEqual([expect.stringMatching(/^\/note received text \d+\.txt$/)]);
  });

  test('a copy the host fails to delete is named in the log and the line says a copy is kept and where (tablet row 141)', async () => {
    const h = host();
    const {api} = fakeRelay({remove: jest.fn(async () => false)}, [offer({t: {fileType: 'text/plain', preview: long}})]);
    const result = await receiveOne(api, h, 'Supernote');
    expect(result).toEqual(expect.stringMatching(/^Text added to the note, over 3 pages\. A copy is kept beside the note as note received text \d+\.txt$/));
    const lines = (h.log as jest.Mock).mock.calls.map(call => call[0]);
    expect(lines).toContainEqual(expect.stringMatching(/^receive: the saved copy of the text could not be removed: \/note received text \d+\.txt$/));
  });

  test('with the delete permission refused no delete is attempted, and the line says the copy is kept and where (tablet row 145, #593)', async () => {
    const h = host({canDelete: jest.fn(async () => false)});
    const {api, calls} = fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: long}})]);
    const result = await receiveOne(api, h, 'Supernote');
    expect(calls.removed).toEqual([]);
    expect(calls.written).toEqual([long]);
    expect(result).toEqual(expect.stringMatching(/^Text added to the note, over 3 pages\. A copy is kept beside the note as note received text \d+\.txt$/));
  });

  test('no text box goes in while the note reloads after a page insert (tablet row 141)', async () => {
    const order: string[] = [];
    const step = (name: string) => jest.fn(async () => {
      order.push(name);
      return ok(true);
    });
    const h = host({
      insertPage: step('page'),
      insertText: step('text'),
      insertTextOnPage: step('text on page'),
      wait: jest.fn(async (ms: number) => {
        order.push(`wait ${ms}`);
      }),
    });
    const {api} = fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: long}})]);
    await receiveOne(api, h, 'Supernote');
    const settle = `wait ${PAGE_SETTLE_MS}`;
    expect(order).toEqual(['page', settle, 'page', settle, 'text', 'text on page', 'text on page']);
  });

  test.each([
    ['a page cannot be inserted', {insertPage: jest.fn(async () => fail(MODULE_CODE, 'refused'))}],
    ['the Note app dies at the first text box', {insertText: jest.fn(async () => fail(MODULE_CODE, 'DeadObjectException'))}],
    ['a later piece is refused', {insertTextOnPage: jest.fn(async () => fail(MODULE_CODE, 'DeadObjectException'))}],
  ])('when %s, the whole text stays saved beside the note and the line says where and how long', async (_name, overrides) => {
    const h = host(overrides);
    const {api, calls} = fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: long}})]);
    const result = await receiveOne(api, h, 'Supernote');
    expect(result).toEqual(expect.stringMatching(/^Text over 3 pages, not all added: saved whole as note received text \d+\.txt, beside the note$/));
    expect(calls.written).toEqual([long]);
    expect(calls.removed).toEqual([]);
  });

  test('when a page cannot be inserted no text goes in', async () => {
    const h = host({insertPage: jest.fn(async () => fail(MODULE_CODE, 'refused'))});
    await receiveOne(fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: long}})]).api, h, 'Supernote');
    expect(h.insertText).not.toHaveBeenCalled();
  });

  test('a text that fits is one box on the page, with no page inserted', async () => {
    const h = host();
    const result = await receiveOne(fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: 'one\ntwo'}})]).api, h, 'Supernote');
    expect(result).toBe(copy.receivedText);
    expect(h.insertPage).not.toHaveBeenCalled();
    expect(pagesOf(MANTA, 'one\ntwo')).toEqual(['one\ntwo']);
  });

  test('when that file cannot be written either, the text waits for the next note', async () => {
    const h = host({insertPage: jest.fn(async () => fail(MODULE_CODE, 'refused'))});
    const writeText = jest.fn(async (path: string) => {
      if (path.endsWith('.txt')) {
        throw new Error('no write');
      }
      return null;
    });
    const result = await receiveOne(fakeRelay({writeText}, [offer({t: {fileType: 'text/plain', preview: long}})]).api, h, 'Supernote');
    expect(result).toBe(copy.textKeptWaiting(3));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('pending.json'), expect.stringContaining(words[1099]));
  });
});

describe('a received text moved past ink stays above the page bar (#577)', () => {
  test('ink from the top down to 2400 leaves no band above the bar: the box stays where it is, not under it', () => {
    const page = {width: 1920, height: 2560};
    const ink = [{left: 0, top: 0, right: 1920, bottom: 2400}];
    const {rect} = freeTextBox(page, 'one', null, ink);
    expect(rect.bottom).toBeLessThanOrEqual(page.height - PAGE_BAR_PX);
  });
});

describe('a received text avoids the ink on the page (#199)', () => {
  // The device round of 2026-11-16: a 1920 x 2560 page, the word «apple» at y 277 to 457 and a
  // written line at y 483 to 585, where the first text box landed at y 384 to 427.
  const MANTA = {width: 1920, height: 2560};
  const apple = {left: 500, top: 277, right: 900, bottom: 457};
  const line = {left: 300, top: 483, right: 1500, bottom: 585};
  const ink = [apple, line];

  test('today\'s place crosses the ink, so the box goes into the free band below it', () => {
    expect(inkUnderRect(textBox(MANTA, 'one'), {rects: ink, complete: true})).not.toBeNull();
    const {rect, free} = freeTextBox(MANTA, 'one', null, ink);
    expect(free).toBe(true);
    expect(rect.top).toBeGreaterThanOrEqual(line.bottom);
    expect(inkUnderRect(rect, {rects: ink, complete: true})).toBeNull();
  });

  test('a free place stays where it is, and an unknown page keeps today\'s place', () => {
    const today = textBox(MANTA, 'one');
    expect(freeTextBox(MANTA, 'one', null, [])).toEqual({rect: today, free: true});
    expect(freeTextBox(MANTA, 'one', null, null)).toEqual({rect: today, free: false});
  });

  test('a page full of ink keeps today\'s place, marked not free', () => {
    const all = [{left: 0, top: 0, right: MANTA.width, bottom: MANTA.height}];
    expect(freeTextBox(MANTA, 'one', null, all)).toEqual({rect: textBox(MANTA, 'one'), free: false});
  });

  test('the box is inserted below the ink and lassoed alone', async () => {
    const host = note({
      pageSize: jest.fn(async () => ok(MANTA)),
      occupied: jest.fn(async () => ok({rects: ink, complete: true})),
    });
    const text = offer({t: {fileType: 'text/plain', preview: 'one'}});
    await expect(receiveOne(fakeRelay({}, [text]).api, host, 'Supernote')).resolves.toBe(
      copy.receivedText,
    );
    const rect = (host.insertText as jest.Mock).mock.calls[0][0].rect;
    expect(rect.top).toBeGreaterThanOrEqual(line.bottom);
    expect(host.lasso).toHaveBeenCalledWith(rect);
  });

  test('a partial page read places the box at its usual place, never by what was read (#152)', async () => {
    const host = note({
      pageSize: jest.fn(async () => ok(MANTA)),
      occupied: jest.fn(async () => ok({rects: ink, complete: false})),
    });
    const text = offer({t: {fileType: 'text/plain', preview: 'one'}});
    await receiveOne(fakeRelay({}, [text]).api, host, 'Supernote');
    expect(host.insertText).toHaveBeenCalledWith(
      expect.objectContaining({rect: textBox(MANTA, 'one')}),
    );
    expect(host.log).toHaveBeenCalledWith(
      "receive: only part of the page's ink is known: the text goes at its usual place",
    );
  });

  test('a second text still goes below the first', async () => {
    const first = freeTextBox(MANTA, 'one', null, ink).rect;
    const second = freeTextBox(MANTA, 'two', first.bottom, [...ink, first]).rect;
    expect(second.top).toBeGreaterThan(first.bottom);
  });

  test('no lasso when the page read is partial or failed, or ink is under the box; the log says why', async () => {
    const text = offer({t: {fileType: 'text/plain', preview: 'one'}});
    const partial = note({occupied: jest.fn(async () => ok({rects: [], complete: false}))});
    await receiveOne(fakeRelay({}, [text]).api, partial, 'Supernote');
    expect(partial.lasso).not.toHaveBeenCalled();
    expect(partial.log).toHaveBeenCalledWith(
      "receive: lassoElements skipped, only part of the page's ink is known",
    );
    resetPlacedForTests();
    const failed = note({occupied: jest.fn(async () => fail(1, 'no page'))});
    await receiveOne(fakeRelay({}, [text]).api, failed, 'Supernote');
    expect(failed.lasso).not.toHaveBeenCalled();
    expect(failed.insertText).toHaveBeenCalledWith(
      expect.objectContaining({rect: textBox(PAGE, 'one')}),
    );
    resetPlacedForTests();
    const full = note({
      occupied: jest.fn(async () =>
        ok({rects: [{left: 0, top: 0, right: PAGE.width, bottom: PAGE.height}], complete: true}),
      ),
    });
    await receiveOne(fakeRelay({}, [text]).api, full, 'Supernote');
    expect(full.lasso).not.toHaveBeenCalled();
    expect(full.log).toHaveBeenCalledWith('receive: lassoElements skipped, 1 other elements in the rect');
  });
});
