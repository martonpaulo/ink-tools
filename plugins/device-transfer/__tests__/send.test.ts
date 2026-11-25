/** The send flow (#98): device choice, each answer's line, and no PNG left behind. */
import {EMPTY_LASSO_CODE, fail, ok} from '@ink-tools/sn-adapter/official';
import {Device} from '../src/localsend/protocol';
import {relay} from '../src/native';
import {
  discoverDevices,
  findAgain,
  sendCapture,
  tempDir,
} from '../src/send/sendPng';

const TMP = tempDir('/plugin');
const pluginDir = async () => ok('/plugin');
import {
  loadSettings,
  movedDevice,
  ownIdentity,
  saveSettings,
} from '../src/settings/device';
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

test('the picked device is sent to, pinned to its fingerprint', async () => {
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
  [coded('IDENTITY'), 'Mac identity changed, not sent'],
  [coded('TIMEOUT'), 'Mac not reachable'],
  // The offer arrived and was not accepted in time: never «not reachable» (#98).
  [coded('NO_ANSWER'), 'Mac did not accept in time'],
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
  expect(lines).toHaveLength(7);
  // The target first: on the tablet, a send read only «ConnectException», with no address.
  expect(lines[0]).toBe(`Relay: send: to Mac at ${mac.ip}:53317 over https`);
  expect(lines[1]).toMatch(/^Relay: send: prepare-upload failed: IO SSLException in \d+ ms$/);
  expect(lines[2]).toBe('Relay: send: selection: Mac not reachable');
  expect(lines[3]).toBe(`Relay: send: to Mac at ${mac.ip}:53317 over https`);
  expect(lines[4]).toMatch(/^Relay: send: prepare-upload 200 in \d+ ms$/);
  expect(lines[5]).toMatch(/^Relay: send: upload 200 in \d+ ms$/);
  expect(lines[6]).toBe('Relay: send: page: Sent to Mac');
  expect(lines.join('\n')).not.toContain('mac-fp');
  expect(lines.join('\n')).not.toMatch(/sessionId|token|"s"/);
});

describe('a receiver that moved (#98)', () => {
  // On the tablet, the Mac saved at one DHCP address had another a week later: every send met
  // `ConnectException EHOSTUNREACH` at the old one and read «not reachable».
  const moved = {...mac, ip: lan(192, 168, 1, 43)};
  const dead = coded('IO');
  const register = (device: Device) => ({
    ip: device.ip,
    text: JSON.stringify({
      alias: device.alias,
      fingerprint: device.fingerprint,
      port: device.port,
      protocol: device.protocol,
    }),
  });
  const saved = JSON.stringify({fingerprint: 'self', pins: {Mac: mac.fingerprint}, last: mac});

  function moving(found: Device[], ...replies: Parameters<typeof answers>) {
    return fakeRelay({
      post: answers(...replies),
      discover: jest.fn(async () => found.map(register)),
      readText: jest.fn(async () => saved),
    });
  }

  test('is found again by its fingerprint, saved there, and sent to', async () => {
    const {api, native, calls} = moving([moved], dead, {status: 200, body: session}, {status: 200});
    const outcome = await sendCapture(
      api,
      sender,
      mac,
      TMP,
      'selection',
      made,
      () => 1,
      findAgain(api, sender, pluginDir),
    );
    expect(outcome).toEqual({kind: 'toast', text: 'Sent to Mac'});
    expect((native.post as jest.Mock).mock.calls.map(call => new URL(call[0]).host)).toEqual([
      `${mac.ip}:53317`,
      `${moved.ip}:53317`,
      `${moved.ip}:53317`,
    ]);
    expect(JSON.parse(calls.written[0])).toEqual({
      fingerprint: 'self',
      pins: {Mac: mac.fingerprint},
      last: moved,
    });
    const lines = logged.mock.calls.map(call => call[0]);
    expect(lines).toContain(`Relay: send: to Mac at ${moved.ip}:53317 over https`);
  });

  test('found nowhere else, it is not reachable, with one offer and nothing saved', async () => {
    const {api, calls} = moving([], dead);
    const outcome = await sendCapture(
      api,
      sender,
      mac,
      TMP,
      'page',
      made,
      () => 1,
      findAgain(api, sender, pluginDir),
    );
    expect(outcome).toEqual({kind: 'toast', text: 'Mac not reachable'});
    expect(calls.written).toEqual([]);
    expect(logged.mock.calls.map(call => call[0])).toContain(
      'Relay: send: Mac found at no other address',
    );
  });

  test('at the same address, a timed-out offer is never made twice', async () => {
    const {api, native} = moving([mac], coded('TIMEOUT'));
    const relocate = jest.fn(findAgain(api, sender, pluginDir));
    await sendCapture(api, sender, mac, TMP, 'page', made, () => 1, relocate);
    expect(relocate).toHaveBeenCalledTimes(1);
    expect(native.post).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a changed identity', coded('IDENTITY')],
    ['an offer not accepted in time', coded('NO_ANSWER')],
    ['an answer', {status: 403}],
  ])('%s is not looked for elsewhere', async (_what, reply) => {
    const {api, native} = moving([moved], reply);
    const relocate = jest.fn(findAgain(api, sender, pluginDir));
    await sendCapture(api, sender, mac, TMP, 'page', made, () => 1, relocate);
    expect(relocate).not.toHaveBeenCalled();
    expect(native.post).toHaveBeenCalledTimes(1);
  });

  test('movedDevice keeps what to save, and nothing when nothing moved', () => {
    expect(movedDevice(mac, [{...moved, deviceModel: 'MacBook'}])).toEqual(moved);
    expect(movedDevice(mac, [{...mac, alias: 'Mac 2'}])).toEqual({...mac, alias: 'Mac 2'});
    expect(movedDevice(mac, [mac])).toBeNull();
    expect(movedDevice(mac, [{...moved, fingerprint: 'other'}])).toBeNull();
    expect(movedDevice(null, [moved])).toBeNull();
  });
});

test('a send presents the certificate it announces, and none without the identity (#98)', async () => {
  const settings = {fingerprint: 'saved', pins: {}, last: null};
  const {api} = fakeRelay();
  await expect(ownIdentity(api, settings, async () => ok('/p'))).resolves.toEqual({
    fingerprint: 'cert-fp',
    identityFolder: '/p',
  });
  await expect(
    ownIdentity(api, settings, async () => fail(-1, 'no dir')),
  ).resolves.toEqual({fingerprint: 'saved', identityFolder: null});
});

test('an upload with no answer is not reachable, since only the offer waits for the person (#98)', async () => {
  const {api} = fakeRelay({
    post: answers({status: 200, body: session}, coded('NO_ANSWER')),
  });
  await expect(sendCapture(api, sender, mac, TMP, 'page', made)).resolves.toEqual({
    kind: 'toast',
    text: 'Mac not reachable',
  });
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
    expect(settings).toEqual({fingerprint: '8'.repeat(32), pins: {}, last: null});
  });

  test('the pins and the last pick survive a save and a load (#307)', async () => {
    const {api, calls} = fakeRelay();
    await saveSettings(api, {fingerprint: 'f', pins: {Mac: mac.fingerprint}, last: mac}, pluginDir);
    const read = jest.fn(async (_path: string) => calls.written[0]);
    const {api: again} = fakeRelay({readText: read});
    await expect(loadSettings(again, pluginDir)).resolves.toEqual({
      fingerprint: 'f',
      pins: {Mac: mac.fingerprint},
      last: mac,
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
    expect((await loadSettings(api, pluginDir)).last).toBeNull();
  });
});
