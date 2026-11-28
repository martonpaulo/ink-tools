/**
 * The part of a note page an Ink Tools tool may draw or place on (#577): the note's page bar
 * covers a page's bottom 116 px, measured on the Manta (`docs/supernote.md` › the page bar, #553),
 * so nothing a tool places reaches into it. shortcut: the toolbar's width over a page's side, when
 * shown, is not measured yet; upgrade with its band once the tablet round measures it (#577).
 */
import type {Size} from './lasso';

/** The page bar's height over a page's bottom edge, in page pixels [measured, Manta, #553]. */
export const PAGE_BAR_PX = 116;

/** The page's area above the page bar, from its top-left corner. */
export function writableSize(page: Size): Size {
  return {width: page.width, height: Math.max(0, page.height - PAGE_BAR_PX)};
}
