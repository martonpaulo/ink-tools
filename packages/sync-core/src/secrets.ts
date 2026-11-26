/**
 * The sign-in secrets Bridge's providers need (#90, owner decision D16 A). The first route is the
 * Mac command `inkctl secret set <provider>`, which writes one file per provider into Bridge's
 * private plugin folder; Bridge only reads that file and deletes it to sign out. Another route
 * (an on-tablet field, a file edited on a computer) is one more writer of the same file.
 */

/**
 * Providers that need a secret. ICS needs none: its URL is a setting. `google-client` is Google's
 * «Desktop app» OAuth client, which the token refresh sends with the refresh token (#200).
 */
export type SecretProvider = 'todoist' | 'icloud' | 'google' | 'google-client';

export const SECRET_PROVIDERS: SecretProvider[] = ['todoist', 'icloud', 'google', 'google-client'];

/** The seam to the stored secrets; the plugin implements it over its private folder. */
export interface SecretStore {
  /** The secret, or null when the provider is signed out. A failed read throws. */
  read(provider: SecretProvider): Promise<string | null>;
  /** Sign out: delete the provider's secret. */
  remove(provider: SecretProvider): Promise<void>;
}

/** The one owner of the file names; `inkctl` writes the same ones. */
export function secretFileName(provider: SecretProvider): string {
  if (!SECRET_PROVIDERS.includes(provider)) throw new Error(`secrets: unknown provider ${String(provider)}`);
  return `${provider}.secret`;
}

/** The characters Settings shows of a stored secret, so the owner can tell two apart. */
export const SHOWN_TAIL = 4;

/** What Settings shows of a secret: never the value, only its last characters. */
export function maskSecret(value: string): string {
  return value.length <= SHOWN_TAIL ? '…' : `…${value.slice(-SHOWN_TAIL)}`;
}

/**
 * Read a stored secret. One trailing newline (LF or CRLF) from a pipe is dropped. An empty value or
 * one with a control character throws: a broken file never becomes a secret sent to a service.
 */
export function parseSecret(raw: string): string {
  const value = raw.replace(/\r?\n$/, '');
  if (value === '') throw new Error('secrets: the stored secret is empty');
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('secrets: the stored secret holds a control character');
  return value;
}

/**
 * Read the stored Google OAuth client (#200): the one-line JSON `inkctl secret set google-client`
 * writes, `{"client_id": …, "client_secret": …}`. A broken file throws, so the calendar run fails
 * with the reason instead of sending a broken client to Google.
 */
export function parseGoogleClient(raw: string): {clientId: string; clientSecret: string} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(parseSecret(raw));
  } catch (e) {
    throw new Error(`secrets: the Google client is not JSON${e instanceof SyntaxError ? '' : `: ${(e as Error).message}`}`);
  }
  const field = (name: string) => {
    const value = (parsed as Record<string, unknown> | null)?.[name];
    if (typeof value !== 'string' || value === '') throw new Error(`secrets: the Google client has no ${name}`);
    return value;
  };
  return {clientId: field('client_id'), clientSecret: field('client_secret')};
}

/**
 * Read the stored iCloud sign-in (#30): `<Apple ID>:<app-specific password>`, the Basic credentials
 * form CalDAV sends (RFC 7617, where a user name holds no colon). `inkctl secret set icloud` takes it
 * on standard input from the two login Keychain items `docs/security.md` names. A value with no
 * colon, or an empty half, throws, so the calendar run fails with the reason.
 */
export function parseICloudSignIn(raw: string): {appleId: string; password: string} {
  const value = parseSecret(raw);
  const at = value.indexOf(':');
  if (at < 0) throw new Error('secrets: the iCloud sign-in is not <Apple ID>:<app-specific password>');
  const appleId = value.slice(0, at);
  const password = value.slice(at + 1);
  if (!appleId) throw new Error('secrets: the iCloud sign-in has no Apple ID');
  if (!password) throw new Error('secrets: the iCloud sign-in has no app-specific password');
  return {appleId, password};
}

/** A provider's sign-in, as Settings words it. */
export type SignIn =
  | {state: 'signedOut'}
  | {state: 'signedIn'; tail: string}
  /** The file is there but did not read: never shown as signed out. */
  | {state: 'unreadable'; reason: string};

export async function signInState(store: SecretStore, provider: SecretProvider): Promise<SignIn> {
  try {
    const value = await store.read(provider);
    return value === null ? {state: 'signedOut'} : {state: 'signedIn', tail: maskSecret(value)};
  } catch (e) {
    return {state: 'unreadable', reason: (e as Error).message};
  }
}
