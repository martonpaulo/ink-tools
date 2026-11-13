/**
 * Adult and explicit pictures never show (#69): a fixed rule, always on, for every source, with
 * no setting to turn it off (owner, 2026-11-06). It reads only signals the sources already return,
 * so it costs no request per result: the result's title (on Commons, its file name) and, on
 * Commons, the file's categories. A classical nude statue filtered out is an accepted false
 * positive; an explicit picture on page 1 is not (brief section 5.6).
 */
import {withoutAccents, words} from '../query';
import type {SearchResult} from '../types';

/**
 * Whole words, lowercase and without accents, in English, Portuguese, Spanish, French, German,
 * Italian and Dutch. Left out on purpose: «nu» (the Greek letter, and Vietnamese «nữ», woman, once
 * accents go), «nudo» (Spanish for knot), «nus» (a university's initials), «breast» and «nipple»
 * (chicken breast, breast cancer, a baby bottle), «erection» (of a building),
 * «xxx» (the Roman numeral).
 */
const ADULT_WORDS = new Set([
  // English
  'nude',
  'nudes',
  'nudity',
  'naked',
  'nakedness',
  'nudism',
  'nudist',
  'nudists',
  'naturism',
  'naturist',
  'topless',
  'toplessness',
  'sex',
  'sexual',
  'sexually',
  'sexy',
  'nsfw',
  'lewd',
  'obscene',
  'penis',
  'penises',
  'penile',
  'phallus',
  'phallic',
  'vulva',
  'vagina',
  'vaginal',
  'clitoris',
  'scrotum',
  'testicles',
  'intercourse',
  'coitus',
  'orgasm',
  'fetish',
  'fetishism',
  'bdsm',
  'striptease',
  'ecchi',
  // Portuguese
  'nua',
  'nuas',
  'nudez',
  'nudismo',
  'nudista',
  'sexo',
  // Spanish
  'desnudo',
  'desnuda',
  'desnudos',
  'desnudas',
  'desnudez',
  'desnudismo',
  // French
  'nue',
  'nues',
  'nudite',
  'sexe',
  'sexuel',
  'sexuelle',
  // German
  'nackt',
  'nackte',
  'nackter',
  'nacktheit',
  'sexuell',
  // Italian
  'nuda',
  'nudi',
  'nudita',
  'sesso',
  'sessuale',
  // Dutch
  'naakt',
  // Every language
  'porn',
  'porns',
  'pornstar',
  'pornstars',
]);

/**
 * Word starts that are adult in every word they begin: pornografia, erotica, genitalia. «porn»
 * alone is a word above, not a stem: the French towns Pornic and Pornichet stay (#110).
 */
const ADULT_STEMS = [
  'porno',
  'erotic',
  'erotiq',
  'erotik',
  'erotis',
  'genital',
  'masturb',
  'hentai',
  'порн',
  'эрот',
];

/**
 * Words adult only in a Commons category name, never checked in a title: «Breasts», «Human surface
 * anatomy of female breasts» and «Transgender women's breasts» hold explicit photos whose titles
 * name nothing a title check can safely leave out (measured 2026-11-10, probe word «breast»,
 * #69). A title keeps «chicken breasts» and «nipple» (a baby bottle); a category such as «SVG
 * breasts» left out with them is an accepted false positive.
 */
const ADULT_CATEGORY_WORDS = new Set([
  'breasts',
  'nipple',
  'nipples',
  'areola',
  'areolas',
  'areolae',
]);

/** Phrases, mostly Commons category names, that name adult content without one word above. */
const ADULT_PHRASES = [
  'human breasts',
  'bare breasts',
  'fan service',
  'explicit medical',
  'sexually explicit',
];

/**
 * Lowercase words with the accents removed: «Nudité» reads as «nudite». File names join words
 * with digits and capitals, so «Nude2» and «NakedWoman» split there first (#110).
 */
function plainWords(text: string): string[] {
  return words(
    withoutAccents(text)
      .replace(/(\p{L})(?=\p{N})|(\p{N})(?=\p{L})/gu, '$1$2 ')
      .replace(/(\p{Ll})(?=\p{Lu})/gu, '$1 '),
  );
}

function isAdultWord(word: string): boolean {
  return (
    ADULT_WORDS.has(word) || ADULT_STEMS.some(stem => word.startsWith(stem))
  );
}

/** True when the text names adult content: whole words, so «Sexton» and «Essex» stay. */
export function hasAdultWords(text: string): boolean {
  const found = plainWords(text);
  if (found.some(isAdultWord)) {
    return true;
  }
  const joined = ` ${found.join(' ')} `;
  return ADULT_PHRASES.some(phrase => joined.includes(` ${phrase} `));
}

/** True when Commons category names name adult content, with the category-only words too. */
export function hasAdultCategories(categories: string): boolean {
  return (
    hasAdultWords(categories) ||
    plainWords(categories).some(word => ADULT_CATEGORY_WORDS.has(word))
  );
}

/** A result to leave out: its title, or the categories its source sent with it, are adult. */
export function isAdult(
  result: Pick<SearchResult, 'title'>,
  categories = '',
): boolean {
  return hasAdultWords(result.title) || hasAdultCategories(categories);
}

/** The results with every adult one left out, in their order. */
export function withoutAdult(results: readonly SearchResult[]): SearchResult[] {
  return results.filter(result => !isAdult(result));
}
