/** A whole note both ways (#504): received into Note/ keeping both copies, sent to the Mac whole. */
import {ok} from '@ink-tools/sn-adapter/official';
import {capability, CAPABILITIES, requirements} from '../src/capabilities';
import {copy} from '../src/copy';
import {decideOffer, Device, noteName, readOffer} from '../src/localsend/protocol';
import {notePath, openNotePath, placeNote} from '../src/receive/noteFile';
import {NOTE_DIR} from '../src/receive/pdfNote';
import {NoteHost, receiveOne, resetPlacedForTests} from '../src/receive/receive';
import {noteFileName, sendNote} from '../src/send/sendNote';
import {fakeRelay} from '../test-support/fakeRelay';
import {fakeNote} from '../test-support/fakeNote';

const RECEIVED = '/plugin/tmp/received-sess.note';
const PLAN = `${NOTE_DIR}/Plan.note`;

let logged: jest.SpyInstance;
beforeEach(() => {
  resetPlacedForTests();
  logged = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logged.mockRestore());

function host(overrides: Partial<NoteHost> = {}): NoteHost {
  return fakeNote({pageKey: jest.fn(async () => ok(`${NOTE_DIR}/Other.note#0`)), ...overrides});
}

const noteOffer = (fileName: string, size = 2048) => ({
  kind: 'offer' as const,
  body: JSON.stringify({
    info: {alias: 'Mac'},
    files: {n: {fileName, fileType: 'application/octet-stream', size}},
  }),
  sessionId: 'sess',
  token: 'tok',
});

describe('the offer', () => {
  test('a .note of any type is taken as a whole note under its own name', () => {
    expect(readOffer(noteOffer('Plan.note').body)).toEqual({kind: 'note', fileId: 'n', name: 'Plan'});
    const decision = decideOffer(noteOffer('Plan.NOTE').body, 'sess', 'tok');
    expect(decision.status).toBe(200);
    expect(decision.extension).toBe('note');
  });

  test('the name never carries a folder or a character a file name cannot hold', () => {
    expect(noteName('../../etc/Plan.note')).toBe('Plan');
    expect(noteName('a\\b\\Wo:r*k?.note')).toBe('Work');
    expect(noteName('...note')).toBeNull();
    expect(noteName('.note')).toBeNull();
  });

  test('a note over the size limit is refused', () => {
    expect(readOffer(noteOffer('Plan.note', 31 * 1024 * 1024).body)).toEqual({
      kind: 'refuse',
      reason: 'size',
    });
  });
});

describe('placing a received note', () => {
  test('a free name: the note moves into Note/', async () => {
    const {api, native} = fakeRelay();
    await expect(placeNote(api, RECEIVED, 'Plan', null)).resolves.toBe(copy.receivedNote('Plan'));
    expect(native.move).toHaveBeenCalledWith(RECEIVED, PLAN);
  });

  test('a note already there is kept, and the received one takes the next free name', async () => {
    const taken = new Set([PLAN, notePath('Plan', 2)]);
    const {api, native, calls} = fakeRelay({exists: jest.fn(async (path: string) => taken.has(path))});
    await expect(placeNote(api, RECEIVED, 'Plan', null)).resolves.toBe(
      copy.receivedNoteKept('Plan', 'Plan 3'),
    );
    expect(native.move).toHaveBeenCalledWith(RECEIVED, notePath('Plan', 3));
    expect(native.move).toHaveBeenCalledTimes(1);
    expect(calls.removed).toEqual([]);
  });

  test('the note open on the screen is refused with the reason, and nothing is moved', async () => {
    const {api, native, calls} = fakeRelay({exists: jest.fn(async () => true)});
    await expect(placeNote(api, RECEIVED, 'Plan', PLAN)).resolves.toBe(copy.noteOpen('Plan'));
    expect(native.move).not.toHaveBeenCalled();
    expect(calls.removed).toEqual([RECEIVED]);
  });

  test('a failed move says so and leaves no received file', async () => {
    const {api, calls} = fakeRelay({move: jest.fn(async () => false)});
    await expect(placeNote(api, RECEIVED, 'Plan', null)).resolves.toBe(copy.noteNotSaved('Plan'));
    expect(calls.removed).toEqual([RECEIVED]);
  });

  test('the open note is read from the page key', () => {
    expect(openNotePath(`${NOTE_DIR}/A#1.note#3`)).toBe(`${NOTE_DIR}/A#1.note`);
    expect(openNotePath(null)).toBeNull();
  });

  test('a receive takes the offer, then places its file under the offered name', async () => {
    const {api, native} = fakeRelay({}, [noteOffer('Plan.note'), {kind: 'file', path: RECEIVED}]);
    await expect(receiveOne(api, host(), 'Supernote')).resolves.toBe(copy.receivedNote('Plan'));
    expect(native.move).toHaveBeenCalledWith(RECEIVED, PLAN);
  });

  test('a receive refuses the note open on the screen', async () => {
    const {api, native} = fakeRelay({}, [noteOffer('Plan.note'), {kind: 'file', path: RECEIVED}]);
    const open = host({pageKey: jest.fn(async () => ok(`${PLAN}#2`))});
    await expect(receiveOne(api, open, 'Supernote')).resolves.toBe(copy.noteOpen('Plan'));
    expect(native.move).not.toHaveBeenCalled();
  });

  test('a note file with no accepted offer is removed, never placed', async () => {
    const {api, native, calls} = fakeRelay({}, [{kind: 'file', path: RECEIVED}]);
    await receiveOne(api, host(), 'Supernote');
    expect(native.move).not.toHaveBeenCalled();
    expect(calls.removed).toContain(RECEIVED);
  });
});

describe('sending a note', () => {
  const sender = {alias: 'Supernote', fingerprint: 'self', identityFolder: '/plugin'};
  const mac: Device = {
    alias: 'Mac',
    ip: [192, 168, 1, 20].join('.'),
    port: 53317,
    protocol: 'https',
    fingerprint: 'mac-fp',
  };

  test('the open note goes whole, under its own name, as plain bytes', async () => {
    const post = jest
      .fn()
      .mockResolvedValueOnce({status: 200, body: JSON.stringify({sessionId: 's', files: {image: 't'}})})
      .mockResolvedValueOnce({status: 200, body: ''});
    const {api, calls} = fakeRelay({post});
    await expect(sendNote(api, sender, {device: mac}, PLAN)).resolves.toBe('Sent to Mac');
    const offered = JSON.parse(post.mock.calls[0][2]);
    expect(offered.files.image).toMatchObject({
      fileName: 'Plan.note',
      fileType: 'application/octet-stream',
    });
    expect(post.mock.calls[1][3]).toBe(PLAN);
    expect(post.mock.calls[1][1]).toEqual({'Content-Type': 'application/octet-stream'});
    // The note itself is never removed or changed.
    expect(calls.removed).toEqual([]);
  });

  test('with no note open nothing is sent', async () => {
    const {api, native} = fakeRelay();
    await expect(sendNote(api, sender, {device: mac}, null)).resolves.toBe(copy.noNote);
    expect(native.post).not.toHaveBeenCalled();
  });

  test('an unreadable note says so', async () => {
    const {api} = fakeRelay({
      fileInfo: jest.fn(async () => {
        throw new Error('IO');
      }),
    });
    await expect(sendNote(api, sender, {device: mac}, PLAN)).resolves.toBe(copy.noNoteFile);
  });

  test('its file name is the note name with no folder', () => {
    expect(noteFileName(PLAN)).toBe('Plan.note');
  });
});

describe('the declared capabilities', () => {
  test('a whole note goes both ways', () => {
    expect(capability('sendWholeNote', 'toTablet')?.id).toBe('receiveNote');
    expect(capability('sendWholeNote', 'toMac')?.id).toBe('sendNote');
  });

  test('every requirement has its words: what is missing and the step that fixes it', () => {
    for (const cap of CAPABILITIES) {
      for (const need of requirements(cap)) {
        expect(need.what).toEqual(expect.any(String));
        expect(need.step).toEqual(expect.any(String));
      }
    }
  });
});
