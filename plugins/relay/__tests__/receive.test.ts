/** One receive (#49): from the offer to the note, with a scripted module and note. */
import {fail, ok} from '@supernote-tools/sn-adapter/official';
import {copy} from '../src/copy';
import {
  NoteHost,
  receiveOne,
  resetPlacedForTests,
  textBox,
} from '../src/receive/receive';
import {receiveState, runReceive} from '../src/receive/session';
import {fakeRelay} from '../test-support/fakeRelay';

const PAGE = {width: 1404, height: 1872};

beforeEach(resetPlacedForTests);

function note(overrides: Partial<NoteHost> = {}) {
  const host: NoteHost = {
    permissions: jest.fn(async () => null),
    pluginDir: jest.fn(async () => ok('/plugin')),
    pageKey: jest.fn(async () => ok('/note.note#0')),
    pageSize: jest.fn(async () => ok(PAGE)),
    closeView: jest.fn(async () => ok(true)),
    insertText: jest.fn(async () => ok(true)),
    lasso: jest.fn(async () => ok(true)),
    insertImage: jest.fn(async () => ok(true)),
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

test('an image is answered with a session, inserted when it arrives, then removed', async () => {
  const {api, calls} = fakeRelay({}, [
    offer({f: {fileType: 'image/png', size: 100}}),
    {kind: 'file', path: '/tmp/received-sess.png'},
  ]);
  const host = note();
  await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(copy.receivedImage);
  expect(calls.answers[0][0]).toBe(200);
  expect(calls.answers[0].slice(2)).toEqual(['f', 'png']);
  expect(host.insertImage).toHaveBeenCalledWith('/tmp/received-sess.png');
  expect(calls.removed).toEqual(['/tmp/received-sess.png']);
  expect(host.insertText).not.toHaveBeenCalled();
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
  await expect(receiveOne(busy.api, note(), 'Supernote')).resolves.toBe(copy.receiveFailed);
  const noDir = note({pluginDir: jest.fn(async () => fail(-1, 'none'))});
  await expect(receiveOne(fakeRelay().api, noDir, 'Supernote')).resolves.toBe(
    copy.receiveFailed,
  );
});

test('a text with no open note is «Open a note first»', async () => {
  const {api} = fakeRelay({}, [offer({t: {fileType: 'text/plain', preview: 'x'}})]);
  const host = note({pageSize: jest.fn(async () => fail(-1, 'no note'))});
  await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(copy.noNote);
  expect(host.insertText).not.toHaveBeenCalled();
});

test('a failed insert says so', async () => {
  const {api} = fakeRelay({}, [
    offer({f: {fileType: 'image/jpeg', size: 1}}),
    {kind: 'file', path: '/tmp/a.jpg'},
  ]);
  const host = note({insertImage: jest.fn(async () => ok(false))});
  await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(copy.insertFailed);
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
  await expect(receiveOne(api, host, 'Supernote')).resolves.toBe(
    copy.permissionRefused('File write'),
  );
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

test('a second tap while receiving starts nothing', async () => {
  const {api} = fakeRelay({}, [{kind: 'stopped'}]);
  const show = jest.fn();
  const first = runReceive(api, note(), 'Supernote', show);
  expect(receiveState()).toBe('starting');
  await expect(runReceive(api, note(), 'Supernote', show)).resolves.toBeNull();
  await expect(first).resolves.toBe(copy.receiveStopped);
  expect(show).toHaveBeenCalledTimes(1);
  expect(receiveState()).toBe('idle');
});
