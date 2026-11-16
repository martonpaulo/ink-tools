/**
 * The languages Word Lookup's picture search asks, in a module with no device import, so the
 * search lab reads this constant, never a copy (#183).
 */
import {DEFINED_LANGUAGES} from '@supernote-tools/ink-core';

/**
 * The languages a picture search asks, in order: the definition's, then English, the language of
 * Ink2Pic's search and its lab. Without English, «apple» was only looked up in the Portuguese
 * and Spanish Wikipedias, which find the brand, and its logo led (#13).
 * shortcut: fixed, as the definition's `LANGUAGES` says; read the person's languages once Lookup
 * has them.
 */
export const PICTURE_LANGUAGES: readonly string[] = [...DEFINED_LANGUAGES, 'en'];
