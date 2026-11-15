/** LocalSend v2 at the edge (#98): the request bodies and every answer we read. */
import {
  announce,
  Device,
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
    deviceType: 'headless',
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
