/**
 * A term's short encyclopedic summary (#114): a 3-sentence bio of a person («Lula da Silva») or the
 * opening of a topic's article («inteligência artificial»), from Wikipedia's own extract of the
 * article's introduction. Keyless: one MediaWiki Action API request per language, a search for
 * the best article with its plain-text intro (`prop=extracts`, the TextExtracts extension), so a
 * misspelled or differently cased term still finds its page.
 *
 * A disambiguation page or no article is no summary, never a guess. Current-events topics are
 * best effort: the summary is whatever the article's introduction says today.
 */
import type {LanguageCode} from './dictionary';
import type {FetchText} from './wiktionary';

/** The sentences one summary gives: three lines under a word, not an article. */
export const SUMMARY_SENTENCES = 3;

/** The longest summary kept, cut at a word: a text box under a word, not an article. */
export const MAX_SUMMARY_CHARACTERS = 420;

export function summaryUrl(term: string, language: LanguageCode): string {
  const q = encodeURIComponent(term.trim().replace(/\s+/g, ' '));
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    'generator=search',
    `gsrsearch=${q}`,
    'gsrlimit=1',
    `prop=${encodeURIComponent('extracts|pageprops')}`,
    'ppprop=disambiguation',
    'exintro=1',
    'explaintext=1',
    `exsentences=${SUMMARY_SENTENCES}`,
    'redirects=1',
  ].join('&');
  return `https://${language}.wikipedia.org/w/api.php?${params}`;
}

/** One article's summary: its title, its intro's first sentences and the Wikipedia it is from. */
export type Summary = {title: string; text: string; language: LanguageCode};

type SummaryPage = {
  title?: string;
  extract?: string;
  pageprops?: {disambiguation?: string};
};
type SummaryResponse = {
  error?: {code?: string; info?: string};
  batchcomplete?: boolean;
  query?: {pages?: SummaryPage[]};
};

/** The text cut at the last word that fits `MAX_SUMMARY_CHARACTERS`, with an ellipsis. */
function cut(text: string): string {
  if (text.length <= MAX_SUMMARY_CHARACTERS) {
    return text;
  }
  const head = text.slice(0, MAX_SUMMARY_CHARACTERS - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > 0 ? head.slice(0, space) : head).replace(/[\s,;:]+$/, '')}…`;
}

/**
 * The summary in a response, null when the search found no article or only a disambiguation
 * page; throws on an error answer or a body that is not the API's, so the caller reports it.
 */
export function parseSummary(text: string, language: LanguageCode): Summary | null {
  let data: SummaryResponse;
  try {
    data = JSON.parse(text) as SummaryResponse;
  } catch {
    throw new Error('the answer is not JSON');
  }
  if (data === null || typeof data !== 'object') {
    throw new Error('the answer is not a JSON object');
  }
  if (data.error) {
    throw new Error(`${data.error.code ?? 'error'}: ${data.error.info ?? ''}`.trim());
  }
  if (!data.query && !data.batchcomplete) {
    throw new Error('neither query nor error in the answer');
  }
  const page = data.query?.pages?.[0];
  const extract = page?.extract?.replace(/\s+/g, ' ').trim();
  if (!page?.title || !extract || page.pageprops?.disambiguation !== undefined) {
    return null;
  }
  return {title: page.title, text: cut(extract), language};
}

/** The first language's summary, and every failure on the way, for the log. */
export type SummaryResult = {summary: Summary | null; errors: string[]};

/**
 * The term's summary from the first language whose Wikipedia has an article for it. A failed
 * language is logged and the next one is asked; the result is empty only when none had one.
 */
export async function summarizeFirst(
  fetchText: FetchText,
  term: string,
  languages: readonly LanguageCode[],
): Promise<SummaryResult> {
  const errors: string[] = [];
  for (const language of languages) {
    try {
      const summary = parseSummary(await fetchText(summaryUrl(term, language)), language);
      if (summary) {
        return {summary, errors};
      }
    } catch (error) {
      errors.push(`wikipedia ${language}: ${(error as Error).message}`);
    }
  }
  return {summary: null, errors};
}
