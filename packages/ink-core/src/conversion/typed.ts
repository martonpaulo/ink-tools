/**
 * How wide the Note app draws a typed text, so a converted word's box holds it on one line (#590).
 *
 * One average width for every character (0.55 of the font size) made «mesa» about 2.2 font sizes
 * wide, while the Note app drew it about 2.4 wide, and its box, one font size wider than that
 * estimate, still wrapped the «a» onto a second line: «hola» and «luna», narrower letters, stayed
 * on one line [measured, Manta, tablet row 140, 2026-11-28]. The capture's letters have Roboto's
 * shapes and spacing at about 103 px for that word (`tablet-results.md` › Shift 13).
 */

/**
 * Each character's advance in Roboto Regular, the Note app's text-box font, as a share of the font
 * size (the font's advance width over its 2048 units) [inference: from the capture's shapes; a font
 * the person picked in the Note app changes it, `docs/supernote.md` › Custom fonts].
 */
const ADVANCE: Record<string, number> = {
  ' ': 0.25, '!': 0.26, '"': 0.32, '#': 0.62, '$': 0.56, '%': 0.73, '&': 0.62, "'": 0.17,
  '(': 0.34, ')': 0.35, '*': 0.43, '+': 0.57, ',': 0.2, '-': 0.28, '.': 0.26, '/': 0.41,
  '0': 0.56, '1': 0.56, '2': 0.56, '3': 0.56, '4': 0.56, '5': 0.56, '6': 0.56, '7': 0.56,
  '8': 0.56, '9': 0.56, ':': 0.24, ';': 0.21, '<': 0.51, '=': 0.55, '>': 0.52, '?': 0.47,
  '@': 0.9, A: 0.65, B: 0.62, C: 0.65, D: 0.66, E: 0.57, F: 0.55, G: 0.68, H: 0.71, I: 0.27,
  J: 0.55, K: 0.63, L: 0.54, M: 0.87, N: 0.71, O: 0.69, P: 0.63, Q: 0.69, R: 0.62, S: 0.59,
  T: 0.6, U: 0.65, V: 0.64, W: 0.89, X: 0.63, Y: 0.6, Z: 0.6, '[': 0.27, '\\': 0.41, ']': 0.27,
  _: 0.45, a: 0.53, b: 0.55, c: 0.51, d: 0.55, e: 0.52, f: 0.34, g: 0.55, h: 0.54, i: 0.24,
  j: 0.24, k: 0.49, l: 0.24, m: 0.86, n: 0.54, o: 0.56, p: 0.55, q: 0.55, r: 0.33, s: 0.5,
  t: 0.32, u: 0.54, v: 0.48, w: 0.73, x: 0.48, y: 0.46, z: 0.48,
};

/** A character the table lacks counts as wide as «W», the widest letter it holds. */
const WIDEST = ADVANCE.W;

/** The marks Unicode's decomposition puts after a letter («á» is «a» and «´»), drawn over it. */
const COMBINING = /[̀-ͯ]/u;

/**
 * How much wider than its letters a line is counted: a quarter more, for a font that draws them
 * wider than Roboto and the room the box keeps inside its frame (#590).
 * shortcut: a margin, not the host's own measure; measure a typed line's width and the box's inner
 * padding on the tablet to set it.
 */
export const TYPED_MARGIN = 1.25;

/** The width of `line` (one line, no line break) at `fontSize`, in page pixels, margin included. */
export function typedWidth(line: string, fontSize: number): number {
  let ems = 0;
  for (const char of line.normalize('NFD')) {
    if (!COMBINING.test(char)) {
      ems += ADVANCE[char] ?? WIDEST;
    }
  }
  return Math.ceil(ems * fontSize * TYPED_MARGIN);
}
