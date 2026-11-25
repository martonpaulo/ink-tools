/** The send flow (#98): device choice, each answer's line, and no PNG left behind. */
import {EMPTY_LASSO_CODE, fail, ok} from '@ink-tools/sn-adapter/official';
import {Device} from '../src/localsend/protocol';
import {relay} from '../src/native';
import {discoverDevices, sendCapture, tempDir} from '../src/send/sendPng';

const TMP = tempDir('/plugin');
const pluginDir = async () => ok('/plugin');
import {loadSettings, ownIdentity, saveSettings} from '../src/settings/device';
import {fakeRelay} from '../test-support/fakeRelay';

/** A synthetic LAN address from its four parts. */
const lan = (...parts: number[]) => parts.join('.');

const sender = {alias: 'Supernote', fingerprint: 'self', identityFolder: '/plugin'};
const mac: Device = {
  alias: 'Mac',
  ip: lan(192, 168, 1, 20),
  port: 53317,
  protocol: 'https',
  fingerprint: 'mac-fp',
};

// Each send logs its steps (#98); the suite keeps them out of its output and reads them here.
let logged: jest.SpyInstance;
beforeEach(() => {
  logged = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logged.mockRestore());

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
  await expect(sendCapture(api, sender, null, TMP, 'page', make)).resolves.toEqual({
    kind: 'choose',
  });
  expect(make).not.toHaveBeenCalled();
});

test('a saved device is used with no question, pinned to its fingerprint', async () => {
  const post = answers({status: 200, body: session}, {status: 200});
  const {api, calls} = fakeRelay({post});
  const outcome = await sendCapture(api, sender, mac, TMP, 'page', made, () => 7);
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
  // Our certificate is the client certificate LocalSend 1.18 requires, on both steps (#98).
  expect(prepare[5]).toBe('/plugin');
  expect(upload[5]).toBe('/plugin');
  expect(upload[0]).toContain('/upload?sessionId=s&fileId=image&token=t');
  expect(upload[2]).toBeNull();
  expect(upload[3]).toBe(`${TMP}/page-7.png`);
  expect(calls.removed).toContain(`${TMP}/page-7.png`);
});

test('an http receiver gets no pin', async () => {
  const post = answers({status: 200, body: session}, {status: 200});
  const {api} = fakeRelay({post});
  await sendCapture(api, sender, {...mac, protocol: 'http'}, TMP, 'page', made);
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
    const outcome = await sendCapture(api, sender, mac, TMP, 'page', made, () => 1);
    expect(outcome).toEqual({kind: 'toast', text});
    expect(calls.removed).toEqual([`${TMP}/page-1.png`]);
  },
);

test('each step and the outcome are logged as a line, with no body or token (#98)', async () => {
  const refused = Object.assign(new Error('SSLException'), {code: 'IO'});
  const {api} = fakeRelay({post: answers(refused)});
  await sendCapture(api, sender, mac, TMP, 'selection', made);
  const sent = fakeRelay({post: answers({status: 200, body: session}, {status: 200})});
  await sendCapture(sent.api, sender, mac, TMP, 'page', made);
  const lines = logged.mock.calls.map(call => call[0]);
  expect(lines).toHaveLength(5);
  expect(lines[0]).toMatch(/^Relay: send: prepare-upload failed: IO SSLException in \d+ ms$/);
  expect(lines[1]).toBe('Relay: send: selection: Mac not reachable');
  expect(lines[2]).toMatch(/^Relay: send: prepare-upload 200 in \d+ ms$/);
  expect(lines[3]).toMatch(/^Relay: send: upload 200 in \d+ ms$/);
  expect(lines[4]).toBe('Relay: send: page: Sent to Mac');
  expect(lines.join('\n')).not.toMatch(/sessionId|token|"s"/);
});

test('a send presents the certificate it announces, and none without the identity (#98)', async () => {
  const settings = {fingerprint: 'saved', device: null};
  const {api} = fakeRelay();
  await expect(ownIdentity(api, settings, async () => ok('/p'))).resolves.toEqual({
    fingerprint: 'cert-fp',
    identityFolder: '/p',
  });
  await expect(
    ownIdentity(api, settings, async () => fail(-1, 'no dir')),
  ).resolves.toEqual({fingerprint: 'saved', identityFolder: null});
});

test('a failed upload is never «sent»', async () => {
  const {api} = fakeRelay({
    post: answers({status: 200, body: session}, {status: 500}),
  });
  await expect(sendCapture(api, sender, mac, TMP, 'page', made)).resolves.toEqual({
    kind: 'toast',
    text: 'Mac answered 500',
  });
});

test('an empty lasso says «Nothing selected» and sends nothing', async () => {
  const {api, native, calls} = fakeRelay();
  const outcome = await sendCapture(api, sender, mac, TMP, 'selection', () =>
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
  await sendCapture(api, sender, mac, TMP, 'selection', () =>
    Promise.resolve(ok('/other/l.png')),
  );
  expect(calls.removed).toContain('/other/l.png');
});

test('the PNG is written in the private folder, never in shared storage (#164)', async () => {
  const make = jest.fn(async (path: string) => ok(path));
  const {api} = fakeRelay({post: answers({status: 204})});
  await sendCapture(api, sender, mac, tempDir('/data/plugins/relay'), 'page', make, () => 3);
  expect(make).toHaveBeenCalledWith('/data/plugins/relay/tmp/page-3.png');
  expect(make.mock.calls[0][0]).not.toMatch(/^\/storage\/emulated\/0\//);
});

test('a receiver outside the LAN is refused before any request', async () => {
  const {api, native} = fakeRelay();
  const outcome = await sendCapture(
    api,
    sender,
    {...mac, ip: '8.8.8.8'},
    TMP,
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

test('discovery serves /register with our identity, where LocalSend answers first (#98)', async () => {
  // A LocalSend register body: its info, with no `announce` field.
  const register = JSON.stringify({
    alias: 'Mac',
    version: '2.1',
    deviceModel: 'MacBook',
    deviceType: 'desktop',
    fingerprint: 'mac-fp',
    port: 53317,
    protocol: 'https',
    download: false,
  });
  const discover = jest.fn(async () => [{ip: lan(10, 0, 0, 2), text: register}]);
  const {api} = fakeRelay({discover});
  const found = await discoverDevices(api, sender, async () => ok('/plugin'));
  expect(found.ok && found.value).toEqual([
    {
      alias: 'Mac',
      ip: lan(10, 0, 0, 2),
      port: 53317,
      protocol: 'https',
      fingerprint: 'mac-fp',
      deviceModel: 'MacBook',
    },
  ]);
  const args = discover.mock.calls[0] as unknown[];
  expect(args[4]).toBe('/plugin');
  expect(JSON.parse(args[5] as string)).toMatchObject({
    alias: sender.alias,
    fingerprint: sender.fingerprint,
    protocol: 'https',
    port: 53317,
  });

  // Without the private folder there is no identity to serve: multicast answers only.
  await discoverDevices(api, sender, async () => fail(-1, 'no dir'));
  expect((discover.mock.calls[1] as unknown[])[4]).toBeNull();
});

test('without the native module every call fails as MISSING', async () => {
  const api = relay({});
  const answer = await api.readText('/x');
  expect(!answer.ok && answer.moduleCode).toBe('MISSING');
});

describe('settings', () => {
  test('a missing or unreadable file starts fresh with a new fingerprint', async () => {
    const {api} = fakeRelay({readText: jest.fn(async () => '{oops')});
    const settings = await loadSettings(api, pluginDir, () => 0.5);
    expect(settings).toEqual({fingerprint: '8'.repeat(32), device: null});
  });

  test('the chosen device survives a save and a load, pin included', async () => {
    const {api, calls} = fakeRelay();
    await saveSettings(api, {fingerprint: 'f', device: mac}, pluginDir);
    const read = jest.fn(async (_path: string) => calls.written[0]);
    const {api: again} = fakeRelay({readText: read});
    await expect(loadSettings(again, pluginDir)).resolves.toEqual({
      fingerprint: 'f',
      device: mac,
    });
    // In the private folder: a shared path is outside the whitelist (#164).
    expect(read).toHaveBeenCalledWith('/plugin/settings.json');
  });

  test('a saved device outside the LAN is dropped', async () => {
    const text = JSON.stringify({
      fingerprint: 'f',
      device: {...mac, ip: '8.8.8.8'},
    });
    const {api} = fakeRelay({readText: jest.fn(async () => text)});
    expect((await loadSettings(api, pluginDir)).device).toBeNull();
  });
});
