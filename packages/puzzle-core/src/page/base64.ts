/**
 * Bytes as base64 (RFC 4648, with padding), the form a page PNG crosses React Native's bridge in:
 * to the Puzzles page file module and to an `Image` data URI (#386). React Native's `btoa` takes a string of
 * characters, so a page would first become a 50 kB string; this reads the bytes directly.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Bytes per group of four characters. */
const GROUP = 3;

/** Bits per base64 character, and the mask of one character's bits. */
const CHAR_BITS = 6;
const CHAR_MASK = (1 << CHAR_BITS) - 1;
const BYTE_BITS = 8;
/** The places of a group's four characters, the first holding the highest bits. */
const PLACES = [3, 2, 1, 0] as const;

export function toBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  const char = (word: number, place: number) => ALPHABET[(word >> (place * CHAR_BITS)) & CHAR_MASK];
  for (let i = 0; i < bytes.length; i += GROUP) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const word = (((a << BYTE_BITS) | b) << BYTE_BITS) | c;
    // A last group of one or two bytes ends in one or two `=` in place of its empty characters.
    const shown = Math.min(GROUP, bytes.length - i) + 1;
    out.push(...PLACES.map((place, k) => (k < shown ? char(word, place) : '=')));
  }
  return out.join('');
}
