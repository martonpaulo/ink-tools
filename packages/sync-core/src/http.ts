import {parseUrl} from './url';

/** The one HTTP seam under every provider: an injected fetch and the https rule (#85). */
export interface HttpInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** `Reads` names the body readers a provider needs: `json`, `text` or both. */
export type HttpFetch<Reads = {json(): Promise<unknown>}> = (url: string, init: HttpInit) => Promise<{ok: boolean; status: number} & Reads>;

/**
 * The URL when it is `https:`, else a refusal naming only the scheme and host: a feed address can
 * hold a secret path or query, and a CalDAV request carries the app password (#80).
 */
export function requireHttps(url: string, what: string): string {
  // Never `new URL(url).protocol`: React Native's URL throws on that getter (#209).
  const parsed = parseUrl(url);
  if (!parsed) throw new Error(`${what} needs an https: URL`);
  if (parsed.protocol !== 'https:') throw new Error(`${what} needs an https: URL, got ${parsed.protocol}//${parsed.host}`);
  return url;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Bits per base64 digit, and per UTF-8 continuation byte. */
const SEXTET = 6;
const SEXTET_MASK = 0x3f;
/** Octets per base64 group of four digits. */
const GROUP = 3;

/** The UTF-8 octets of a string, without `TextEncoder`, which the tablet's runtime may lack. */
function utf8(text: string): number[] {
  const out: number[] = [];
  const tail = (cp: number, shift: number) => 0x80 | ((cp >> (shift * SEXTET)) & SEXTET_MASK);
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> SEXTET), tail(cp, 0));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> (2 * SEXTET)), tail(cp, 1), tail(cp, 0));
    else out.push(0xf0 | (cp >> (GROUP * SEXTET)), tail(cp, 2), tail(cp, 1), tail(cp, 0));
  }
  return out;
}

/**
 * The Basic credentials of RFC 7617: base64 of the UTF-8 `username:password`, with no platform
 * global, so a CalDAV request is built the same on the tablet and in a test (#30).
 */
export function basicCredentials(username: string, password: string): string {
  const bytes = utf8(`${username}:${password}`);
  const digit = (n: number, shift: number) => BASE64[(n >> (shift * SEXTET)) & SEXTET_MASK];
  let out = '';
  for (let i = 0; i < bytes.length; i += GROUP) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 0x10) | ((b ?? 0) << 0x8) | (c ?? 0);
    out += digit(n, GROUP) + digit(n, 2);
    out += b === undefined ? '=' : digit(n, 1);
    out += c === undefined ? '=' : digit(n, 0);
  }
  return out;
}

/** The Authorization value of a call with an OAuth access token, read at that moment. */
export const bearer = async (getAccessToken: () => Promise<string>): Promise<string> => `Bearer ${await getAccessToken()}`;
