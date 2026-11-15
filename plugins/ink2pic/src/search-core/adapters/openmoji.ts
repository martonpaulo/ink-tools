/**
 * OpenMoji's black outline symbols for abstract words and emotions (#67, brief section 5): the
 * word is matched on the device against a keyword index shipped in the plugin, with no request;
 * only the picture comes from the network. The index is built by
 * `scripts/build-openmoji-index.cjs` from pinned data files (see its header and NOTICE.md).
 */
import type {PictureHost, SourceAdapter, SourceContext} from '../adapter';
import INDEX from '../data/openmoji-index.json';
import {lookupLanguages, normalise, withoutAccents} from '../query';
import {PAGE_SIZE, SearchResult, SourceOutcome, sourceId} from '../types';

/** The pinned release's pictures, as the index build recorded them (#99): never `master`. */
const PICTURES = INDEX.pictures;
/** The one size the pictures come in: 618 x 618 PNG, 9.5 to 17 KB (research A). */
export const OPENMOJI_WIDTH = 618;
const LICENSE = 'CC BY-SA 4.0';
const ATTRIBUTION = 'OpenMoji';
/** Symbols offered per search: one page, so they never crowd out the drawings. */
const MAX_RESULTS = PAGE_SIZE;
/** Symbols that lead the page for an abstract word: a choice, not a page of faces. */
const LEADS_ABSTRACT = 2;

/**
 * How well a symbol matches: the name itself, else a word of it, plus each keyword list that holds
 * the word, summed over the languages: a symbol several sources name for the word ranks higher.
 */
const EXACT_NAME = 6;
const NAME_WORD = 3;
/**
 * A word of the name after « with »: it describes the thing the name is about, so «cat with wry
 * smile» never outranks «grinning face» for «smile» (#112).
 */
const MODIFIER_WORD = 1;
const KEYWORD = 2;
const WEAK_KEYWORD = 1;
const ALL_WORDS = 1;

type Words = {
  name: string;
  nameWords: string[];
  /**
   * The words before « with », the thing the name is about. shortcut: English only; the pt, es and
   * zh names keep every word as a head word, until a non-English feeling word shows the gap.
   */
  headWords: string[];
  /** CLDR's keywords. */
  strong: Set<string>;
  /** Each English list of a lesser source: openmoji_tags, emojilib. */
  weak: Set<string>[];
};
type Emoji = {
  hex: string;
  /** An emotion or a sign: matching it alone makes the query abstract. */
  abstract: boolean;
  title: string;
  byLanguage: Map<string, Words>;
};

const HAN = /\p{Script=Han}/u;

/** Lowercase with accents removed, as the index stores its words: «Frío» is «frio». */
export function fold(text: string): string {
  return withoutAccents(text)
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function parseField(text: string): Words | undefined {
  if (!text) {
    return undefined;
  }
  const [main, ...weak] = text.split('/');
  const [name, ...strong] = main.split(';');
  const folded = fold(name);
  return {
    name: folded,
    nameWords: folded.split(' '),
    headWords: folded.split(' with ')[0].split(' '),
    strong: new Set(strong),
    weak: weak.map(list => new Set(list.split(';'))),
  };
}

let parsed: Emoji[] | undefined;

/** The index, read on the first search only. */
function symbols(): Emoji[] {
  parsed ??= INDEX.entries.map(line => {
    const [head, ...fields] = line.split('\t');
    const [hex, abstract] = head.split(' ');
    const byLanguage = new Map<string, Words>();
    INDEX.languages.forEach((lang, i) => {
      const words = parseField(fields[i]);
      if (words) {
        byLanguage.set(lang, words);
      }
    });
    return {
      hex,
      abstract: abstract === '1',
      title: fields[0].split(/[;/]/)[0],
      byLanguage,
    };
  });
  return parsed;
}

function nameScore(words: Words, query: string): number {
  if (words.name === query) {
    return EXACT_NAME;
  }
  if (HAN.test(query)) {
    return words.name.includes(query) ? NAME_WORD : 0;
  }
  if (words.headWords.includes(query)) {
    return NAME_WORD;
  }
  return words.nameWords.includes(query) ? MODIFIER_WORD : 0;
}

function keywordScore(words: Words, query: string): number {
  return (
    (words.strong.has(query) ? KEYWORD : 0) +
    words.weak.filter(list => list.has(query)).length * WEAK_KEYWORD
  );
}

/** A phrase whose every word is a word of the name or a keyword. */
function hasAllWords(words: Words, query: string): boolean {
  const parts = query.split(' ');
  return (
    parts.length > 1 &&
    parts.every(
      part =>
        words.nameWords.includes(part) ||
        words.strong.has(part) ||
        words.weak.some(list => list.has(part)),
    )
  );
}

/**
 * `whole`: the symbol names or tags the whole word, not only each word of a phrase apart: the
 * «Tokyo tower» is tagged «eiffel» and named «tower», never «eiffel tower» (#24).
 */
type Match = {
  symbol: Emoji;
  score: number;
  named: number;
  whole: boolean;
  /**
   * Its name or a CLDR keyword holds the word: a lesser list alone ties «coffee» to the brown
   * heart (#13).
   */
  strong: boolean;
};

function matchIn(words: Words, query: string): Omit<Match, 'symbol'> {
  const named = nameScore(words, query);
  const score = named + keywordScore(words, query);
  return {
    score: score || (hasAllWords(words, query) ? ALL_WORDS : 0),
    named,
    whole: score > 0,
    strong: named > 0 || words.strong.has(query),
  };
}

/** The symbols the word names in any of the languages, best first; ties keep OpenMoji's order. */
export function matchSymbols(
  query: string,
  languages: readonly string[],
): Match[] {
  const word = fold(normalise(query));
  if (!word) {
    return [];
  }
  const langs = lookupLanguages(query, languages);
  const matches: Match[] = [];
  for (const symbol of symbols()) {
    let score = 0;
    let named = 0;
    let whole = false;
    let strong = false;
    for (const lang of langs) {
      const words = symbol.byLanguage.get(lang);
      if (words) {
        const found = matchIn(words, word);
        score += found.score;
        named = Math.max(named, found.named);
        whole ||= found.whole;
        strong ||= found.strong;
      }
    }
    if (score > 0) {
      matches.push({symbol, score, named, whole, strong});
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Which matches lead the page (#67): those the word names exactly; else, for an abstract word,
 * the best few. A word is abstract when no thing among the matches carries it in its name:
 * «apple» names the red apple, so the drawings lead; «cold» names only the cold face. A symbol
 * that matches only each word of a phrase apart never leads: the Tokyo tower, tagged «eiffel» and
 * named «tower», does not lead «Eiffel Tower» (#24). Nor does a symbol that only a lesser keyword
 * list ties to the word when a thing's CLDR keywords hold it: the brown heart, tagged «coffee» by
 * emojilib, does not lead «coffee», the hot beverage does (#13).
 */
function leaders(matches: readonly Match[]): Set<Match> {
  const exact = matches.filter(match => match.named === EXACT_NAME);
  if (exact.length > 0) {
    return new Set(exact.slice(0, LEADS_ABSTRACT));
  }
  const concrete = matches.some(
    match => !match.symbol.abstract && match.named > 0,
  );
  // A thing whose CLDR keywords hold the word («hot beverage» for «coffee») makes it concrete
  // enough that a symbol only a lesser list ties to it no longer leads (#13).
  const thing = matches.some(match => !match.symbol.abstract && match.strong);
  return new Set(
    concrete
      ? []
      : matches
          .filter(match => match.whole && (match.strong || !thing))
          .slice(0, LEADS_ABSTRACT),
  );
}

let things: Set<string> | undefined;

/**
 * Whether the English word, or its singular, is the one-word name of a thing OpenMoji draws
 * («owl», «house»): a word the ranker reads as another thing in the picture, not a style or a
 * kind of the subject («vintage», «blank») (#24). Read from the shipped index: no request.
 */
export function namesThing(word: string): boolean {
  things ??= new Set(
    symbols()
      .filter(symbol => !symbol.abstract)
      .map(symbol => symbol.byLanguage.get('en')?.name ?? '')
      .filter(name => name !== '' && !name.includes(' ')),
  );
  return (
    things.has(word) || (word.endsWith('s') && things.has(word.slice(0, -1)))
  );
}

/** Every symbol's code, in OpenMoji's order: what «Download symbols» fetches (#91). */
export function symbolHexes(): string[] {
  return symbols().map(symbol => symbol.hex);
}

export function pictureUrl(hex: string): string {
  return `${PICTURES}/${hex}.png`;
}

function toResult(match: Match, leads: boolean): SearchResult {
  const {hex, title} = match.symbol;
  return {
    id: `openmoji:${hex}`,
    source: 'openmoji',
    title,
    thumbUrl: pictureUrl(hex),
    license: LICENSE,
    attribution: ATTRIBUTION,
    mime: 'image/png',
    ...(leads && {leads: true as const}),
  };
}

export async function searchOpenmoji(
  query: string,
  ctx: SourceContext,
): Promise<SourceOutcome> {
  const matches = matchSymbols(query, ctx.languages);
  const lead = leaders(matches);
  return {
    ok: true,
    value: {
      results: matches
        .slice(0, MAX_RESULTS)
        .map(match => toResult(match, lead.has(match))),
    },
  };
}

export const openmojiPictures: PictureHost = {
  url: result => pictureUrl(sourceId(result.id)),
  insertWidth: OPENMOJI_WIDTH,
};

export const openmojiAdapter: SourceAdapter = {
  name: 'openmoji',
  search: searchOpenmoji,
  localIndex: true,
};
