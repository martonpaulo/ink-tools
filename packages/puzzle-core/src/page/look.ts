/**
 * The one owner of every visual value of a Puzzles page (#379): the page size, the greys, the
 * line widths and the cell presets. Values come from `docs/supernote.md` (the Manta's page and
 * greys, «Designing for the screen») and the research report's page rules
 * (`docs/research/2026-11-paper-games.md`, section 1).
 */

export type Orientation = 'portrait' | 'landscape';
/** The writing hand: the side panel goes on the other side, so the hand never covers it. */
export type Hand = 'right' | 'left';
// The page bar's height has one owner, ink-core's `PAGE_BAR_PX`, so the page look and the tools that
// place on a page never drift apart (#577). A relative import: the plugins' Metro configs reach
// ink-core's folder through `plugin-config.js`.
import { PAGE_BAR_PX } from '../../../ink-core/src/pageArea';

/** The Manta's page in pixels; a landscape page is the same page turned. */
export const PAGE_SIZE = {
  portrait: { width: 1920, height: 2560 },
  landscape: { width: 2560, height: 1920 },
} as const satisfies Record<Orientation, { width: number; height: number }>;

/** The Manta page's width in millimetres: 1920 px at 300 pixels per inch. */
const PAGE_WIDTH_MM = 162.56;

/** Millimetres to whole pixels: 7 mm is 83 px, 10 mm 118 px, 15 mm 177 px. */
export function mmToPx(mm: number): number {
  return Math.round((mm * PAGE_SIZE.portrait.width) / PAGE_WIDTH_MM);
}

/** Pixels to millimetres, unrounded: the inverse of `mmToPx`. */
export function pxToMm(px: number): number {
  return (px * PAGE_WIDTH_MM) / PAGE_SIZE.portrait.width;
}

/** The cell sizes a page offers: 7 mm is the least a handwritten digit needs, 15 mm fits candidates. */
export const CELL_PRESETS_MM = [7, 10, 15] as const;
export type CellPreset = (typeof CELL_PRESETS_MM)[number];

/** The step between the screen's 16 grey levels: 0x00, 0x11, ... 0xFF, so the panel never dithers. */
export const GREY_STEP = 17;
export const NATIVE_GREYS: readonly number[] = Array.from({ length: 16 }, (_, i) => i * GREY_STEP);

/** The few greys a page uses, far apart (`docs/supernote.md` › Designing for the screen). */
export const TONES = {
  /** Givens, outer frames, region borders and clue text. */
  ink: 0x00,
  /** Grid lines and the footer. */
  line: 0x44,
  /** The player's ink in the plugin's view: over 3:1 on paper, and apart from the grid's black and grey. */
  pen: 0x77,
  /** Filled icons that must stay apart from ink. */
  strong: 0xaa,
  /** Region shading that the pen's ink still reads over. */
  shade: 0xcc,
  /** Soft panels. */
  soft: 0xee,
  paper: 0xff,
} as const;
export type Tone = keyof typeof TONES;

/** Line widths in whole pixels; the thinnest border stays over the 1.5 px floor. */
export const LINE_PX = {
  grid: 2,
  region: 6,
  frame: 6,
  cage: 2,
  /** A cage line is drawn and left out in this many pixels. */
  cageDash: 12,
  /** Dots of a dot lattice: the radius. */
  dot: 6,
  /** The stroke of a cross and the ring of a white pearl. */
  icon: 4,
} as const;

/** The page margins and the footer band, in millimetres. */
export const PAGE_MM = {
  margin: 8,
  /**
   * The note's page bar covers the page's bottom `PAGE_BAR_PX` (116 px) [measured, Manta, 2026-11-27, #553]:
   * from y 2444 of a 2560 px page, so the footer ends above it (`docs/supernote.md` › Page bar).
   */
  pageBar: pxToMm(PAGE_BAR_PX),
  /**
   * The bottom margin: the page bar and half a millimetre of paper above it; the footer's lowest
   * descender sits about 0.5 mm higher still, so no footer text hides under the bar (#553).
   */
  bottom: pxToMm(PAGE_BAR_PX) + 0.5,
  /**
   * Paper kept clear above the page bar in layout 3, beyond the bar itself: the footer's rule line
   * sat 0.5 mm over the bar in layout 2, so the owner's photo showed it crowding the bar (#553).
   */
  barClearance: 2.5,
  /** The footer band: two lines of `TEXT_SIZE.footerMm` text, packed so the bottom margin costs a grid little height (#553). */
  footer: 10.5,
  /** The gap between the grid, its outside clues and a side panel. */
  gap: 3,
} as const;

/** Text sizes: the font's em as a share of the cell. */
export const TEXT_SIZE = {
  given: 0.62,
  clue: 0.26,
  /** The two sums of a split clue cell (kakuro), each in its half. */
  splitClue: 0.34,
  outsideClue: 0.48,
  /** How deep one outside clue sits across the grid's edge. */
  outsideSlot: 0.65,
  /** An icon's width. */
  icon: 0.64,
  /** The footer's text, in millimetres of em (3 mm or more, the screen's floor). */
  footerMm: 3.4,
  /** A side panel's word list (a word search's words), in millimetres of em. */
  listMm: 3.4,
  /** The step between two lines of a list, as a share of its em. */
  listLeading: 1.45,
  /** An arrowword's clue text in its clue cell, in millimetres of em: the screen's floor. */
  arrowClueMm: 3,
  /** The line step of a clue's wrapped lines, as a share of its em. */
  lineStep: 1.1,
  /** A crossword's clue list, in millimetres of em, and its line step as a share of the em (#400). */
  clueListMm: 3.4,
  clueLineStep: 1.3,
} as const;
