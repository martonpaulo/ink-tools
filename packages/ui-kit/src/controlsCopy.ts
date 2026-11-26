/** The words of the native controls (#273): the visible ones and the spoken names of glyphs. */
import tokens from './tokens.json';

/** The switch's words and the ‹'s name, shared with the Android apps through tokens.json (#275). */
export const ON_TEXT = tokens.word.on.value;
export const OFF_TEXT = tokens.word.off.value;
export const BACK_LABEL = tokens.word.back.value;
export const FIRST_PAGE_LABEL = 'First page';
export const PREVIOUS_PAGE_LABEL = 'Previous page';
export const NEXT_PAGE_LABEL = 'Next page';
export const LAST_PAGE_LABEL = 'Last page';
/** The pager's number, spoken, so a screen reader never says «5 slash 12» (#287). */
export const pageOfLabel = (page: number, total: number) => `Page ${page} of ${total}`;
export const REMOVE_LABEL = 'Remove';
export const DELETE_LABEL = 'Delete';
export const DOWNLOAD_LABEL = 'Download';
/** The spoken name of the field's ×, which clears its text (#287). */
export const CLEAR_LABEL = 'Clear';
/** The code block's «Copy» and the toast that confirms it (#405). */
export const COPY_LABEL = 'Copy';
export const COPIED_TEXT = 'Copied';
