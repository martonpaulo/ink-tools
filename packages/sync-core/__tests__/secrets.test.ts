/** Sign-in secrets: file names, the masked tail and the parse of a stored value (#90). */
import {SecretStore, maskSecret, parseGoogleClient, parseSecret, secretFileName, signInState} from '../src';

const SYNTHETIC = 'synthetic-token-0000-wxyz';

test('each provider has its own file, and an unknown one is refused', () => {
  expect(secretFileName('todoist')).toBe('todoist.secret');
  expect(secretFileName('icloud')).toBe('icloud.secret');
  expect(secretFileName('google-client')).toBe('google-client.secret');
  expect(() => secretFileName('../x' as never)).toThrow('unknown provider');
});

test('Settings sees only the last four characters', () => {
  expect(maskSecret(SYNTHETIC)).toBe('…wxyz');
  expect(maskSecret('abc')).toBe('…');
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

test('the sign-in state: signed out, signed in with the tail, and an unreadable file kept apart', async () => {
  expect(await signInState(store(async () => null), 'todoist')).toEqual({state: 'signedOut'});
  expect(await signInState(store(async () => SYNTHETIC), 'todoist')).toEqual({state: 'signedIn', tail: '…wxyz'});
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
