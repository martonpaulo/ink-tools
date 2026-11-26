/** Sign-in secrets: file names, the account a row names and the parse of a stored value (#90, #433). */
import {SecretStore, parseGoogleClient, parseICloudSignIn, parseSecret, secretFileName, signInState} from '../src';

const SYNTHETIC = 'synthetic-token-0000-wxyz';

test('each provider has its own file, and an unknown one is refused', () => {
  expect(secretFileName('todoist')).toBe('todoist.secret');
  expect(secretFileName('icloud')).toBe('icloud.secret');
  expect(secretFileName('google-client')).toBe('google-client.secret');
  expect(() => secretFileName('../x' as never)).toThrow('unknown provider');
});

test('a piped newline is dropped; an empty value or a control character is refused', () => {
  expect(parseSecret(`${SYNTHETIC}\n`)).toBe(SYNTHETIC);
  expect(parseSecret(`${SYNTHETIC}\r\n`)).toBe(SYNTHETIC);
  expect(() => parseSecret('\n')).toThrow('empty');
  expect(() => parseSecret('ab\u0007cd')).toThrow('control character');
});

function store(read: SecretStore['read']): SecretStore {
  return {read, remove: async () => {}};
}

test('the sign-in state: signed out, signed in with its account, and an unreadable file kept apart (#433)', async () => {
  expect(await signInState(store(async () => null), 'todoist')).toEqual({state: 'signedOut'});
  expect(await signInState(store(async () => SYNTHETIC), 'todoist')).toEqual({state: 'signedIn'});
  expect(await signInState(store(async () => SYNTHETIC), 'todoist', 'tester@example.com')).toEqual({
    state: 'signedIn',
    account: 'tester@example.com',
  });
  // iCloud's account is the Apple ID half of its sign-in; the password half never leaves it.
  const icloud = await signInState(store(async () => 'tester@example.com:abcd-efgh-ijkl-mnop'), 'icloud');
  expect(icloud).toEqual({state: 'signedIn', account: 'tester@example.com'});
  expect(await signInState(store(async () => 'no-colon'), 'icloud')).toEqual({state: 'signedIn'});
  expect(
    await signInState(store(async () => {
      throw new Error('read failed');
    }), 'icloud'),
  ).toEqual({state: 'unreadable', reason: 'read failed'});
});

test('the Google client reads as inkctl writes it; a broken one throws, never a client (#200)', () => {
  const stored = JSON.stringify({client_id: 'id-fixture', client_secret: 'fixture'});
  expect(parseGoogleClient(`${stored}\n`)).toEqual({clientId: 'id-fixture', clientSecret: 'fixture'});
  expect(() => parseGoogleClient('client-SYNTHETIC')).toThrow('not JSON');
  expect(() => parseGoogleClient(JSON.stringify({client_id: 'id-fixture'}))).toThrow('no client_secret');
  expect(() => parseGoogleClient('{"client_id":"","client_secret":"s"}')).toThrow('no client_id');
  expect(() => parseGoogleClient('null')).toThrow('no client_id');
  expect(() => parseGoogleClient('')).toThrow('not JSON: secrets: the stored secret is empty');
});

test('the iCloud sign-in is <Apple ID>:<app-specific password>, split at the first colon (#30)', () => {
  expect(parseICloudSignIn('tester@example.com:abcd-efgh-ijkl-mnop\n')).toEqual({appleId: 'tester@example.com', password: 'abcd-efgh-ijkl-mnop'});
  expect(parseICloudSignIn('tester@example.com:a:b')).toEqual({appleId: 'tester@example.com', password: 'a:b'});
  expect(() => parseICloudSignIn('abcd-efgh-ijkl-mnop')).toThrow('not <Apple ID>:<app-specific password>');
  expect(() => parseICloudSignIn(':abcd')).toThrow('no Apple ID');
  expect(() => parseICloudSignIn('tester@example.com:')).toThrow('no app-specific password');
});

test('no sign-in state holds any part of its secret (#433)', async () => {
  for (const provider of ['todoist', 'google', 'icloud', 'google-client'] as const) {
    const state = JSON.stringify(await signInState(store(async () => `tester@example.com:${SYNTHETIC}`), provider));
    for (let i = 0; i + 3 <= SYNTHETIC.length; i++) expect(state).not.toContain(SYNTHETIC.slice(i, i + 3));
  }
});
