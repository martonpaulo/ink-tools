/** The send flow (#98): device choice, each answer's line, and no PNG left behind. */
import {EMPTY_LASSO_CODE, fail, ok} from '@supernote-tools/sn-adapter/official';
import {Device} from '../src/localsend/protocol';
import {relay} from '../src/native';
import {discoverDevices, sendCapture, TEMP_DIR} from '../src/send/sendPng';
import {loadSettings, saveSettings} from '../src/settings/device';
import {fakeRelay} from '../test-support/fakeRelay';

/** A synthetic LAN address from its four parts. */
const lan = (...parts: number[]) => parts.join('.');

const sender = {alias: 'Supernote', fingerprint: 'self'};
const mac: Device = {
  alias: 'Mac',
  ip: lan(192, 168, 1, 20),
  port: 53317,
  protocol: 'https',
  fingerprint: 'mac-fp',
};
const made = (path: string) => Promise.resolve(ok(path));
const session = JSON.stringify({sessionId: 's', files: {image: 't'}});

function answers(...replies: Array<{status: number; body?: string} | Error>) {
  const post = jest.fn();
  for (const reply of replies) {
    if (reply instanceof Error) {
      post.mockRejectedValueOnce(reply);
    } else {
      post.mockResolvedValueOnce({body: '', ...reply});
    }
  }
  return post;
}

function coded(code: string): Error {
  return Object.assign(new Error(code), {code});
}

test('with no device chosen, the tap opens Settings and makes no picture', async () => {
  const {api} = fakeRelay();
  const make = jest.fn(made);
  await expect(sendCapture(api, sender, null, 'page', make)).resolves.toEqual({
    kind: 'choose',
  });
  expect(make).not.toHaveBeenCalled();
});

test('a saved device is used with no question, pinned to its fingerprint', async () => {
  const post = answers({status: 200, body: session}, {status: 200});
  const {api, calls} = fakeRelay({post});
  const outcome = await sendCapture(api, sender, mac, 'page', made, () => 7);
  expect(outcome).toEqual({kind: 'toast', text: 'Sent to Mac'});
  const [prepare, upload] = post.mock.calls;
  expect(prepare[0]).toBe(
    `https://${mac.ip}:53317/api/localsend/v2/prepare-upload`,
  );
  expect(JSON.parse(prepare[2]).files.image).toEqual({
    id: 'image',
    fileName: 'page-7.png',
    size: 3,
    fileType: 'image/png',
    sha256: 'abc',
  });
  expect(prepare[4]).toBe('mac-fp');
  expect(upload[0]).toContain('/upload?sessionId=s&fileId=image&token=t');
  expect(upload[2]).toBeNull();
  expect(upload[3]).toBe(`${TEMP_DIR}/page-7.png`);
  expect(calls.removed).toContain(`${TEMP_DIR}/page-7.png`);
});

test('an http receiver gets no pin', async () => {
  const post = answers({status: 200, body: session}, {status: 200});
  const {api} = fakeRelay({post});
  await sendCapture(api, sender, {...mac, protocol: 'http'}, 'page', made);
  expect(post.mock.calls[0][4]).toBeNull();
});

test.each([
  [{status: 204}, 'Mac refused the file'],
  [{status: 403}, 'Mac declined'],
  [{status: 409}, 'Mac is busy with another transfer'],
  [{status: 500}, 'Mac answered 500'],
  [coded('IDENTITY'), 'Mac identity changed, choose it again'],
  [coded('TIMEOUT'), 'Mac not reachable'],
  [coded('IO'), 'Mac not reachable'],
])(
  'prepare answer %p reads «%s», and the PNG is removed',
  async (reply, text) => {
    const {api, calls} = fakeRelay({post: answers(reply)});
    const outcome = await sendCapture(api, sender, mac, 'page', made, () => 1);
    expect(outcome).toEqual({kind: 'toast', text});
    expect(calls.removed).toEqual([`${TEMP_DIR}/page-1.png`]);
  },
);

test('a failed upload is never «sent»', async () => {
  const {api} = fakeRelay({
    post: answers({status: 200, body: session}, {status: 500}),
  });
  await expect(sendCapture(api, sender, mac, 'page', made)).resolves.toEqual({
    kind: 'toast',
    text: 'Mac answered 500',
  });
});

test('an empty lasso says «Nothing selected» and sends nothing', async () => {
  const {api, native, calls} = fakeRelay();
  const outcome = await sendCapture(api, sender, mac, 'selection', () =>
    Promise.resolve(fail(EMPTY_LASSO_CODE, 'empty')),
  );
  expect(outcome).toEqual({kind: 'toast', text: 'Nothing selected'});
  expect(native.post).not.toHaveBeenCalled();
  expect(calls.removed).toHaveLength(1);
});

test('a picture written elsewhere is removed too', async () => {
  const {api, calls} = fakeRelay({
    post: answers({status: 200, body: session}, {status: 200}),
  });
  await sendCapture(api, sender, mac, 'selection', () =>
    Promise.resolve(ok('/other/l.png')),
  );
  expect(calls.removed).toContain('/other/l.png');
});

test('a receiver outside the LAN is refused before any request', async () => {
  const {api, native} = fakeRelay();
  const outcome = await sendCapture(
    api,
    sender,
    {...mac, ip: '8.8.8.8'},
    'page',
    made,
  );
  expect(outcome).toEqual({kind: 'toast', text: 'Mac is not on this network'});
  expect(native.post).not.toHaveBeenCalled();
});

test('discovery keeps one device per fingerprint and drops bad answers', async () => {
  const answer = (alias: string, fingerprint: string) =>
    JSON.stringify({alias, fingerprint, port: 53317, protocol: 'https'});
  const {api} = fakeRelay({
    discover: jest.fn(async () => [
      {ip: lan(10, 0, 0, 2), text: answer('Mac', 'a')},
      {ip: lan(10, 0, 0, 2), text: answer('Mac', 'a')},
      {ip: lan(10, 0, 0, 3), text: answer('Mac', 'b')},
      {ip: lan(10, 0, 0, 4), text: answer('Supernote', 'self')},
      {ip: lan(10, 0, 0, 5), text: 'junk'},
    ]),
  });
  const found = await discoverDevices(api, sender);
  expect(found.ok && found.value.map(d => [d.alias, d.fingerprint])).toEqual([
    ['Mac', 'a'],
    ['Mac', 'b'],
  ]);
});

test('without the native module every call fails as MISSING', async () => {
  const api = relay({});
  const answer = await api.readText('/x');
  expect(!answer.ok && answer.moduleCode).toBe('MISSING');
});

describe('settings', () => {
  test('a missing or unreadable file starts fresh with a new fingerprint', async () => {
    const {api} = fakeRelay({readText: jest.fn(async () => '{oops')});
    const settings = await loadSettings(api, () => 0.5);
    expect(settings).toEqual({fingerprint: '8'.repeat(32), device: null});
  });

  test('the chosen device survives a save and a load, pin included', async () => {
    const {api, calls} = fakeRelay();
    await saveSettings(api, {fingerprint: 'f', device: mac});
    const {api: again} = fakeRelay({
      readText: jest.fn(async () => calls.written[0]),
    });
    await expect(loadSettings(again)).resolves.toEqual({
      fingerprint: 'f',
      device: mac,
    });
  });

  test('a saved device outside the LAN is dropped', async () => {
    const text = JSON.stringify({
      fingerprint: 'f',
      device: {...mac, ip: '8.8.8.8'},
    });
    const {api} = fakeRelay({readText: jest.fn(async () => text)});
    expect((await loadSettings(api)).device).toBeNull();
  });
});
