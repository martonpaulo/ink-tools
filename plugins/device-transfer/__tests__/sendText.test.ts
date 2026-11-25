/** «Send Text» (#99): the text offer, its answers, and that nothing leaves before «Send». */
import {
  Device,
  MAX_TEXT_NAME,
  textFileName,
  utf8Bytes,
} from '../src/localsend/protocol';
import {copy} from '../src/copy';
import {sendText} from '../src/send/sendText';
import {
  cancelTextSend,
  confirmTextSend,
  startTextSend,
  TextDeps,
  textState,
} from '../src/send/textSession';
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

function replies(...answers: Array<{status: number; body?: string}>) {
  const post = jest.fn();
  for (const answer of answers) {
    post.mockResolvedValueOnce({body: '', ...answer});
  }
  return post;
}

test.each([
  ['Café à la crème', 18],
  ['学习笔记', 12],
  ['line one\nline two', 17],
])(
  'the offer of %p carries the whole text and its UTF-8 size',
  async (text, bytes) => {
    const post = replies({status: 204});
    const {api} = fakeRelay({post});
    await expect(sendText(api, sender, mac, text)).resolves.toBe('Sent to Mac');
    const file = JSON.parse(post.mock.calls[0][2]).files.text;
    expect(file).toMatchObject({
      fileType: 'text/plain',
      size: bytes,
      preview: text,
    });
    expect(utf8Bytes(text)).toBe(Buffer.byteLength(text, 'utf8'));
    expect(post.mock.calls[0][4]).toBe('mac-fp');
    expect(post).toHaveBeenCalledTimes(1);
  },
);

test('a 200 with a token gets the text uploaded, and only its 200 is «sent»', async () => {
  const session = JSON.stringify({sessionId: 's', files: {text: 't'}});
  const post = replies({status: 200, body: session}, {status: 200});
  const {api} = fakeRelay({post});
  await expect(sendText(api, sender, mac, 'Olá')).resolves.toBe('Sent to Mac');
  const upload = post.mock.calls[1];
  expect(upload[0]).toContain('/upload?sessionId=s&fileId=text&token=t');
  expect(upload[2]).toBe('Olá');
  expect(upload[3]).toBeNull();
  // Our certificate is the client certificate on both steps (#98).
  expect(post.mock.calls[0][5]).toBe('/plugin');
  expect(upload[5]).toBe('/plugin');
  // The toast line is logged, never the text (#98).
  const lines = logged.mock.calls.map(call => call[0]).join('\n');
  expect(lines).toContain('Relay: send: text: Sent to Mac');
  expect(lines).not.toContain('Olá');
  const failed = fakeRelay({
    post: replies({status: 200, body: session}, {status: 500}),
  });
  await expect(sendText(failed.api, sender, mac, 'x')).resolves.toBe(
    'Mac answered 500',
  );
});

test('a declined text says so; an empty text and an outside receiver send nothing', async () => {
  const {api} = fakeRelay({post: replies({status: 403})});
  await expect(sendText(api, sender, mac, 'x')).resolves.toBe('Mac declined');
  const quiet = fakeRelay();
  await expect(sendText(quiet.api, sender, mac, '  ')).resolves.toBe(
    copy.noText,
  );
  await expect(
    sendText(quiet.api, sender, {...mac, ip: '8.8.8.8'}, 'x'),
  ).resolves.toBe('Mac is not on this network');
  expect(quiet.native.post).not.toHaveBeenCalled();
});

test('a receiver that moved gets the text at its new address (#98)', async () => {
  const moved = {...mac, ip: lan(192, 168, 1, 43)};
  const post = jest.fn();
  post.mockRejectedValueOnce(Object.assign(new Error('ConnectException'), {code: 'IO'}));
  post.mockResolvedValueOnce({status: 204, body: ''});
  const {api} = fakeRelay({post});
  const relocate = jest.fn(async () => moved);
  await expect(sendText(api, sender, mac, 'Olá', relocate)).resolves.toBe('Sent to Mac');
  expect(relocate).toHaveBeenCalledWith(mac);
  expect(new URL(post.mock.calls[1][0]).hostname).toBe(moved.ip);
});

test('the file name is the first words, short, and never empty', () => {
  expect(textFileName('Buy milk, eggs!')).toBe('Buy milk eggs.txt');
  expect(textFileName('word '.repeat(100)).length).toBeLessThanOrEqual(
    MAX_TEXT_NAME,
  );
  expect(textFileName('?!')).toBe('text.txt');
});

function deps(overrides: Partial<TextDeps> = {}): TextDeps {
  return {
    permissions: jest.fn(async () => null),
    refused: (permission: string) => `refused ${permission}`,
    read: jest.fn(async () => 'Buy milk'),
    device: jest.fn(async () => mac),
    send: jest.fn(async () => 'Sent to Mac'),
    closeView: jest.fn(),
    toast: jest.fn(),
    ...overrides,
  };
}

describe('the view', () => {
  afterEach(() => cancelTextSend({closeView: () => {}}));

  test('shows the recognised text first, and «Send» sends it once', async () => {
    const d = deps();
    await startTextSend(d);
    expect(textState()).toEqual({
      phase: 'ready',
      text: 'Buy milk',
      device: mac,
    });
    expect(d.send).not.toHaveBeenCalled();
    await confirmTextSend(d);
    expect(d.send).toHaveBeenCalledWith(mac, 'Buy milk');
    expect(d.toast).toHaveBeenCalledWith('Sent to Mac');
    expect(d.closeView).toHaveBeenCalled();
    expect(textState().phase).toBe('idle');
  });

  test('«Cancel» after recognition sends nothing', async () => {
    const d = deps();
    await startTextSend(d);
    cancelTextSend(d);
    await confirmTextSend(d);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.closeView).toHaveBeenCalled();
  });

  test.each([null, '   '])(
    'a recognition of %p shows «No text recognized» and sends nothing',
    async read => {
      const d = deps({read: jest.fn(async () => read)});
      await startTextSend(d);
      expect(textState().phase).toBe('empty');
      await confirmTextSend(d);
      expect(d.send).not.toHaveBeenCalled();
    },
  );

  test('with no device chosen, Settings shows and the lasso is not read', async () => {
    const d = deps({device: jest.fn(async () => null)});
    await startTextSend(d);
    expect(textState().phase).toBe('idle');
    expect(d.read).not.toHaveBeenCalled();
  });

  test('a refused permission closes the view with a toast that names it', async () => {
    const d = deps({
      permissions: jest.fn(async () => 'plugin.permission.INTERNET'),
    });
    await startTextSend(d);
    expect(d.toast).toHaveBeenCalledWith('refused plugin.permission.INTERNET');
    expect(d.read).not.toHaveBeenCalled();
    expect(textState().phase).toBe('idle');
  });
});
