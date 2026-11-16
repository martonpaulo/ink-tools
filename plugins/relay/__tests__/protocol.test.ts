/** LocalSend v2 at the edge (#98): the request bodies and every answer we read. */
import {
  announce,
  announceAnswer,
  decideOffer,
  Device,
  MAX_FILE_BYTES,
  readOffer,
  receiverInfo,
  isPrivateAddress,
  MAX_ANSWER_BYTES,
  parseAnnounce,
  parsePrepareUpload,
  parseUpload,
  prepareUploadBody,
  prepareUploadUrl,
  uploadUrl,
} from '../src/localsend/protocol';

/** A synthetic LAN address from its four parts. */
const lan = (...parts: number[]) => parts.join('.');

const sender = {alias: 'Supernote', fingerprint: 'self-fp'};
const mac: Device = {
  alias: 'Mac',
  ip: lan(192, 168, 1, 20),
  port: 53317,
  protocol: 'https',
  fingerprint: 'mac-fp',
};

test('the announce asks receivers to answer and offers no download', () => {
  expect(JSON.parse(announce(sender))).toEqual({
    alias: 'Supernote',
    version: '2.1',
    deviceModel: 'Supernote',
    deviceType: 'mobile',
    fingerprint: 'self-fp',
    port: 53317,
    protocol: 'https',
    download: false,
    announce: true,
  });
});

test('the prepare-upload body offers one PNG with its sha256', () => {
  const body = JSON.parse(
    prepareUploadBody(sender, {
      id: 'page',
      fileName: 'page.png',
      size: 1234,
      fileType: 'image/png',
      sha256: 'abc',
    }),
  );
  expect(body.info.fingerprint).toBe('self-fp');
  expect(body.info.announce).toBeUndefined();
  expect(body.files).toEqual({
    page: {
      id: 'page',
      fileName: 'page.png',
      size: 1234,
      fileType: 'image/png',
      sha256: 'abc',
    },
  });
});

test('the URLs name the receiver and escape the session values', () => {
  expect(prepareUploadUrl(mac)).toBe(
    `https://${mac.ip}:53317/api/localsend/v2/prepare-upload`,
  );
  expect(
    uploadUrl(
      mac,
      {kind: 'session', sessionId: 's 1', fileToken: 't&2'},
      'page',
    ),
  ).toBe(
    `https://${mac.ip}:53317/api/localsend/v2/upload?sessionId=s%201&fileId=page&token=t%262`,
  );
});

describe('isPrivateAddress', () => {
  test.each([
    lan(10, 0, 0, 1),
    lan(172, 16, 0, 1),
    lan(172, 31, 255, 255),
    lan(192, 168, 0, 9),
  ])('%s is on the LAN', ip => expect(isPrivateAddress(ip)).toBe(true));
  test.each([
    '8.8.8.8',
    lan(172, 32, 0, 1),
    lan(172, 15, 0, 1),
    lan(192, 169, 0, 1),
    '127.0.0.1',
    lan(10, 0, 0, 256),
    'example.org',
    '::1',
  ])('%s is refused', ip => expect(isPrivateAddress(ip)).toBe(false));
});

describe('parseAnnounce', () => {
  const answer = {
    alias: 'Mac',
    version: '2.1',
    deviceModel: 'Laptop',
    deviceType: 'desktop',
    fingerprint: 'mac-fp',
    port: 53317,
    protocol: 'https',
    download: false,
    announce: false,
  };

  test('a receiver answer gives a device', () => {
    expect(parseAnnounce(JSON.stringify(answer), lan(192, 168, 1, 20))).toEqual(
      {
        ...mac,
        deviceModel: 'Laptop',
      },
    );
  });

  test('a public address, our own announce or a bad shape is dropped', () => {
    const text = JSON.stringify(answer);
    expect(parseAnnounce(text, '8.8.8.8')).toBeNull();
    expect(
      parseAnnounce(
        JSON.stringify({...answer, fingerprint: 'self-fp'}),
        lan(10, 0, 0, 2),
        sender,
      ),
    ).toBeNull();
    expect(parseAnnounce('not json', lan(10, 0, 0, 2))).toBeNull();
    expect(parseAnnounce('[]', lan(10, 0, 0, 2))).toBeNull();
    expect(
      parseAnnounce(JSON.stringify({...answer, alias: ''}), lan(10, 0, 0, 2)),
    ).toBeNull();
    expect(
      parseAnnounce(JSON.stringify({...answer, port: 70000}), lan(10, 0, 0, 2)),
    ).toBeNull();
    expect(
      parseAnnounce(
        JSON.stringify({...answer, protocol: 'ftp'}),
        lan(10, 0, 0, 2),
      ),
    ).toBeNull();
  });

  test('an oversized answer is dropped unread', () => {
    const big = JSON.stringify({...answer, pad: 'x'.repeat(MAX_ANSWER_BYTES)});
    expect(parseAnnounce(big, lan(10, 0, 0, 2))).toBeNull();
  });

  test('an http receiver keeps its scheme', () => {
    const text = JSON.stringify({...answer, protocol: 'http'});
    expect(parseAnnounce(text, lan(10, 0, 0, 2))?.protocol).toBe('http');
  });
});

describe('parsePrepareUpload', () => {
  const ok = JSON.stringify({sessionId: 'sid', files: {page: 'tok'}});

  test('200 gives the session and our token', () => {
    expect(parsePrepareUpload(200, ok, 'page')).toEqual({
      kind: 'session',
      sessionId: 'sid',
      fileToken: 'tok',
    });
  });

  test('204 is a refusal, never sent', () => {
    expect(parsePrepareUpload(204, '', 'page')).toEqual({kind: 'refused'});
  });

  test('403 is declined, 409 busy, anything else failed with its status', () => {
    expect(parsePrepareUpload(403, '', 'page')).toEqual({kind: 'declined'});
    expect(parsePrepareUpload(409, '', 'page')).toEqual({kind: 'busy'});
    expect(parsePrepareUpload(500, '', 'page')).toEqual({
      kind: 'failed',
      status: 500,
    });
  });

  test('a 200 without our token, or malformed, is failed', () => {
    const other = JSON.stringify({sessionId: 'sid', files: {other: 'tok'}});
    expect(parsePrepareUpload(200, other, 'page')).toEqual({
      kind: 'failed',
      status: 200,
    });
    expect(parsePrepareUpload(200, '{', 'page').kind).toBe('failed');
  });
});

test('only an upload answered 200 is sent', () => {
  expect(parseUpload(200)).toEqual({kind: 'sent'});
  expect(parseUpload(400)).toEqual({kind: 'failed', status: 400});
});

describe('receiving an offer (#49)', () => {
  const offer = (files: Record<string, unknown>) =>
    JSON.stringify({info: {alias: 'iPhone'}, files});

  test('a text message is taken from its preview and answered 204', () => {
    const decision = decideOffer(
      offer({t: {id: 't', fileName: 'a.txt', size: 5, fileType: 'text/plain', preview: 'hello'}}),
      's',
      'k',
    );
    expect(decision).toEqual({
      status: 204,
      body: '',
      fileId: null,
      extension: null,
      taken: {kind: 'text', text: 'hello'},
    });
  });

  test('an image opens a session with one token, under our extension', () => {
    const decision = decideOffer(
      offer({f: {id: 'f', fileName: '../x.JPG', size: 10, fileType: 'image/jpeg'}}),
      'sess',
      'tok',
    );
    expect(decision.status).toBe(200);
    expect(JSON.parse(decision.body)).toEqual({sessionId: 'sess', files: {f: 'tok'}});
    expect(decision.fileId).toBe('f');
    expect(decision.extension).toBe('jpg');
  });

  test('a PDF opens a session and is saved as .pdf (#143)', () => {
    const decision = decideOffer(
      offer({p: {id: 'p', fileName: 'Scan.PDF', size: 10, fileType: 'application/pdf'}}),
      'sess',
      'tok',
    );
    expect(decision.status).toBe(200);
    expect(JSON.parse(decision.body)).toEqual({sessionId: 'sess', files: {p: 'tok'}});
    expect(decision.extension).toBe('pdf');
    expect(decision.taken).toEqual({kind: 'pdf', fileId: 'p'});
  });

  test.each([
    ['a text with no preview', {t: {fileType: 'text/plain', size: 1}}, 'shape'],
    ['an empty preview', {t: {fileType: 'text/plain', preview: '  '}}, 'shape'],
    [
      'two files',
      {a: {fileType: 'image/png', size: 1}, b: {fileType: 'image/png', size: 1}},
      'shape',
    ],
    ['an iPhone HEIC photo', {f: {fileType: 'image/heic', size: 10}}, 'type'],
    ['a Word file', {f: {fileType: 'application/msword', size: 10}}, 'type'],
    ['a PDF over the limit', {f: {fileType: 'application/pdf', size: MAX_FILE_BYTES + 1}}, 'size'],
    [
      'two PDFs',
      {a: {fileType: 'application/pdf', size: 1}, b: {fileType: 'application/pdf', size: 1}},
      'shape',
    ],
    ['an image over the limit', {f: {fileType: 'image/png', size: MAX_FILE_BYTES + 1}}, 'size'],
    ['an image with no size', {f: {fileType: 'image/png'}}, 'size'],
  ])('%s is refused with 403', (_what, files, reason) => {
    const decision = decideOffer(offer(files), 's', 'k');
    expect(decision.status).toBe(403);
    expect(decision.fileId).toBeNull();
    expect(decision.taken).toEqual({kind: 'refuse', reason});
  });

  test.each(['', 'not json', '[]', '{"files":[]}', 'x'.repeat(MAX_ANSWER_BYTES + 1)])(
    'an unknown body %# is refused',
    text => {
      expect(readOffer(text)).toEqual({kind: 'refuse', reason: 'shape'});
    },
  );

  test('our info as a receiver serves HTTPS and is not an announce', () => {
    expect(JSON.parse(receiverInfo(sender))).toMatchObject({
      fingerprint: 'self-fp',
      protocol: 'https',
      port: 53317,
    });
    expect(JSON.parse(receiverInfo(sender)).announce).toBeUndefined();
    expect(JSON.parse(announceAnswer(sender)).announce).toBe(false);
  });
});
