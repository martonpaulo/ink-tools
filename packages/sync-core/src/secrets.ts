/**
 * The sign-in secrets Bridge's providers need (#90, owner decision D16 A). The first route is the
 * Mac command `inkctl secret set <provider>`, which writes one file per provider into Bridge's
 * private plugin folder; Bridge only reads that file and deletes it to sign out. Another route
 * (an on-tablet field, a file edited on a computer) is one more writer of the same file.
 */

/** Providers that need a secret. ICS needs none: its URL is a setting. */
export type SecretProvider = 'todoist' | 'icloud' | 'google';

export const SECRET_PROVIDERS: SecretProvider[] = ['todoist', 'icloud', 'google'];

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
