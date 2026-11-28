/** Note Editor through Device Link (#493): pairing once by a grant, an edit, a refusal and a pull. */
import {ActionRefused} from '@ink-tools/sn-adapter/official';
import {copy} from '../src/copy';
import {EDITOR_FILE_TYPE} from '../src/localsend/protocol';
import {receiveOne, resetPlacedForTests} from '../src/receive/receive';
import {
  handleRemote,
  NOTE_FILE_TYPE,
  pairCode,
  pairingPath,
  readMessage,
  sameSecret,
  serveEdits,
} from '../src/receive/remote';
import {fakeNote} from '../test-support/fakeNote';
import {fakeRelay} from '../test-support/fakeRelay';

const MAC = {alias: 'Studio Mac', fingerprint: 'mac-fp'};
const NOTE = '/storage/emulated/0/Note/Plans.note';
/** A LAN address, written as its parts, as send.test.ts does. */
const lan = (...parts: number[]) => parts.join('.');
const SELF = {alias: 'Supernote', fingerprint: 'cert-fp', identityFolder: '/plugin'};

/** A relay whose text files live in a map, so the pairing survives from one offer to the next. */
function relayWithFiles(arrivals: Parameters<typeof fakeRelay>[1] = []) {
  const files = new Map<string, string>();
  const fake = fakeRelay(
    {
      readText: jest.fn(async (path: string) => files.get(path) ?? null),
      writeText: jest.fn(async (path: string, text: string) => {
        files.set(path, text);
        return null;
      }),
    },
    arrivals,
  );
  return {...fake, files};
}

const editorOffer = (message: object, token: string, from = MAC) => ({
  kind: 'offer' as const,
  body: JSON.stringify({info: from, files: {req: {fileType: EDITOR_FILE_TYPE, size: 1, preview: JSON.stringify(message)}}}),
  sessionId: 'sess',
  token,
});

const EDIT_ARGS = {path: NOTE, ops: [{op: 'deleteElements', page: 0, nums: [3]}]};

const note = fakeNote;

beforeEach(() => {
  resetPlacedForTests();
  serveEdits(null);
});

test('a Mac paired once by the code on the tablet sends an edit, which runs and is answered', async () => {
  const askToken = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const code = pairCode(askToken);
  const {api, calls, files} = relayWithFiles([
    editorOffer({request: 'pair'}, askToken),
    editorOffer({request: 'pair', code}, 'paired-grant'),
    editorOffer({request: 'edit', grant: 'paired-grant', args: EDIT_ARGS}, 'unused'),
  ]);
  const edit = jest.fn(async () => ({line: 'DeviceLink: edit: 1 operations applied', results: [{ok: true}]}));
  serveEdits(edit);
  const lines: string[] = [];
  await receiveOne(api, note(), 'Supernote', () => {}, undefined, undefined, line => lines.push(line));
  expect(code).toMatch(/^\d{6}$/);
  expect(lines).toEqual([copy.pairCode(MAC.alias, code), copy.paired(MAC.alias)]);
  expect(calls.answers.map(answer => answer[0])).toEqual([202, 200, 200]);
  expect(JSON.parse(String(calls.answers[1][1]))).toEqual({grant: 'paired-grant'});
  expect(edit).toHaveBeenCalledWith(EDIT_ARGS);
  expect(JSON.parse(String(calls.answers[2][1]))).toMatchObject({ok: true, results: [{ok: true}]});
  // No file id: the receiver opens no upload session for a request.
  expect(calls.answers.every(answer => answer[2] === null)).toBe(true);
  expect(JSON.parse(files.get(pairingPath('/plugin')) ?? '{}')).toEqual({
    paired: {fingerprint: MAC.fingerprint, grant: 'paired-grant'},
    pending: null,
  });
});

test('an edit from a device that is not the paired Mac is refused and never runs', async () => {
  const {api, files} = relayWithFiles();
  files.set(pairingPath('/plugin'), JSON.stringify({paired: {fingerprint: MAC.fingerprint, grant: 'good'}, pending: null}));
  const edit = jest.fn();
  serveEdits(edit);
  const message = (grant: string) => JSON.stringify({request: 'edit', grant, args: EDIT_ARGS});
  const unpaired = await handleRemote(api, SELF, '/plugin', message('good'), {alias: 'Other', fingerprint: 'other-fp'}, 't', jest.fn());
  const wrongToken = await handleRemote(api, SELF, '/plugin', message('bad'), MAC, 't', jest.fn());
  const nothingPaired = relayWithFiles();
  const none = await handleRemote(nothingPaired.api, SELF, '/plugin', message('good'), MAC, 't', jest.fn());
  for (const handled of [unpaired, wrongToken, none]) {
    expect(handled.status).toBe(403);
    expect(JSON.parse(handled.body)).toEqual({refusal: 'unpaired'});
  }
  expect(edit).not.toHaveBeenCalled();
});

test('a wrong pairing code is refused and ends the code, so a second guess fails too', async () => {
  const {api} = relayWithFiles();
  const askToken = '00000000000f4240ffffffffffffffff';
  const code = pairCode(askToken);
  await handleRemote(api, SELF, '/plugin', JSON.stringify({request: 'pair'}), MAC, askToken, jest.fn());
  const wrong = await handleRemote(api, SELF, '/plugin', JSON.stringify({request: 'pair', code: code === '000000' ? '111111' : '000000'}), MAC, 'x', jest.fn());
  expect(wrong).toMatchObject({status: 403, line: copy.pairRefused});
  const late = await handleRemote(api, SELF, '/plugin', JSON.stringify({request: 'pair', code}), MAC, 'x', jest.fn());
  expect(late.status).toBe(403);
});

test('a code is good only for the Mac that asked for it and only within its time', async () => {
  const {api} = relayWithFiles();
  const askToken = 'abcdef0123456789abcdef0123456789';
  const code = pairCode(askToken);
  await handleRemote(api, SELF, '/plugin', JSON.stringify({request: 'pair'}), MAC, askToken, jest.fn(), () => 0);
  const other = await handleRemote(api, SELF, '/plugin', JSON.stringify({request: 'pair', code}), {alias: 'Other', fingerprint: 'other-fp'}, 'x', jest.fn(), () => 1);
  expect(other.status).toBe(403);
  await handleRemote(api, SELF, '/plugin', JSON.stringify({request: 'pair'}), MAC, askToken, jest.fn(), () => 0);
  const expired = await handleRemote(api, SELF, '/plugin', JSON.stringify({request: 'pair', code}), MAC, 'x', jest.fn(), () => 10 * 60 * 1000);
  expect(expired.status).toBe(403);
});

test("an edit the helper refuses answers 422 with the refusal's name", async () => {
  const {api, files} = relayWithFiles();
  files.set(pairingPath('/plugin'), JSON.stringify({paired: {fingerprint: MAC.fingerprint, grant: 'good'}, pending: null}));
  serveEdits(async () => {
    throw new ActionRefused('pen-down: the pen stayed on the page; nothing was applied', undefined, {refusal: 'pen-down'});
  });
  const handled = await handleRemote(api, SELF, '/plugin', JSON.stringify({request: 'edit', grant: 'good', args: EDIT_ARGS}), MAC, 't', jest.fn());
  expect(handled.status).toBe(422);
  expect(JSON.parse(handled.body)).toMatchObject({ok: false, refusal: 'pen-down'});
});

test('a pull sends the whole note to the paired Mac, pinned to its fingerprint, after the answer', async () => {
  const {api, calls, files} = relayWithFiles([
    editorOffer({request: 'pull', grant: 'good', path: NOTE, reply: {ip: lan(10, 0, 0, 20), port: 53318}}, 't'),
  ]);
  files.set(pairingPath('/plugin'), JSON.stringify({paired: {fingerprint: MAC.fingerprint, grant: 'good'}, pending: null}));
  await receiveOne(api, note(), 'Supernote');
  expect(calls.answers[0][0]).toBe(202);
  const [prepareUrl, , prepareBody, , pinned] = calls.post[0];
  expect(prepareUrl).toBe(`https://${lan(10, 0, 0, 20)}:53318/api/localsend/v2/prepare-upload`);
  expect(pinned).toBe(MAC.fingerprint);
  expect(JSON.parse(String(prepareBody)).files.image).toMatchObject({fileName: 'Plans.note', fileType: NOTE_FILE_TYPE});
});

test('a request of an unknown shape, a pull outside Note/ or to a public address, is refused', async () => {
  expect(readMessage('not json')).toBeNull();
  expect(readMessage(JSON.stringify({request: 'edit', args: EDIT_ARGS}))).toBeNull();
  const pull = (path: string, ip: string) => readMessage(JSON.stringify({request: 'pull', grant: 't', path, reply: {ip, port: 53317}}));
  expect(pull('/storage/emulated/0/Document/x.note', lan(10, 0, 0, 2))).toBeNull();
  expect(pull('/storage/emulated/0/Note/../x.note', lan(10, 0, 0, 2))).toBeNull();
  expect(pull(NOTE, '8.8.8.8')).toBeNull();
  expect(pull(NOTE, lan(10, 0, 0, 2))).toMatchObject({request: 'pull', path: NOTE});
  const {api} = relayWithFiles();
  const handled = await handleRemote(api, SELF, '/plugin', 'not json', MAC, 't', jest.fn());
  expect(handled.status).toBe(400);
});

test('secrets compare equal only when they are the same', () => {
  expect(sameSecret('abc', 'abc')).toBe(true);
  expect(sameSecret('abc', 'abd')).toBe(false);
  expect(sameSecret('abc', 'abcd')).toBe(false);
});
