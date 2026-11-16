/**
 * The word's canonical pictures (#43, #71, brief section 5.4). One Wikipedia search finds the
 * article, its Wikidata item and its lead image, with spelling tolerance («Napolean», «Frederico
 * García Lorca»); the item's claims give its flag (P41), logo or symbol (P154) and image (P18),
 * read from Commons with the lead image. For a person (P31 = Q5), Commons pictures that depict
 * the item join them. Keyless; three requests for a word with an item, one without.
 *
 * Response shapes come from the documented APIs and the research probes of 2026-11-06; the
 * device run is the first live one [TO TEST].
 */
import type {SourceAdapter, SourceContext} from '../adapter';
import {apiFailure} from '../fetcher';
import {knownHit} from '../phrase';
import {
  lookupLanguages,
  normalise,
  readIntent,
  sameWord,
  withoutAccents,
  withoutStyles,
  words,
} from '../query';
import {Failure, Outcome, SourceOutcome, sourceFailure} from '../types';
import {commonsFiles, commonsSearch} from './commons';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
/** The API of one language's Wikipedia: `{language}` is its code. */
const WIKIPEDIA_API = 'https://{language}.wikipedia.org/w/api.php';
/** Flag first, then logo or symbol, then image: the order they are shown in. */
export const PICTURE_PROPERTIES = ['P41', 'P154', 'P18'] as const;
const INSTANCE_OF = 'P31';
const FLAG = PICTURE_PROPERTIES[0];
const IMAGE = PICTURE_PROPERTIES[2];
const HUMAN = 'Q5';
const LOGO = 'P154';
/**
 * The item is an organisation: it has a headquarters (P159). With its logo, or without one the
 * first file of its Commons «logos» category, the logo leads the page (#81, #92).
 */
const HEADQUARTERS = 'P159';
/**
 * The item is a place: it has coordinates (P625). A logo (P154) leads the page for any item but
 * a person or a place, so a brand with no class list entry and no headquarters, Coca-Cola
 * (P31 drink brand, trademark), still leads with its logo (#92).
 */
const COORDINATES = 'P625';
/** The item's Commons category (P373): its «<category> logos» subcategory holds its logos. */
const COMMONS_CATEGORY = 'P373';
/**
 * A name, not a person: the article of the word is about the given or family name («Napoleão»,
 * a family name in the English Wikipedia), so the most notable person it names is the subject
 * (#92).
 */
const NAMES: ReadonlySet<string> = new Set([
  'Q101352', // family name
  'Q202444', // given name
  'Q12308941', // male given name
  'Q11879590', // female given name
  'Q3409032', // unisex given name
]);
/** The signature file: never a picture of the person (research C). */
const SIGNATURE = 'P109';

type Statement = {
  rank?: string;
  mainsnak?: {snaktype?: string; datavalue?: {value?: unknown}};
};
type Entity = {missing?: string; claims?: Record<string, Statement[]>};
type EntityResponse = {
  error?: {code?: string; info?: string};
  entities?: Record<string, Entity>;
};
type WikiPage = {
  title?: string;
  index?: number;
  pageimage?: string;
  pageprops?: {wikibase_item?: string; disambiguation?: string};
};
type WikiResponse = {
  batchcomplete?: boolean;
  error?: {code?: string; info?: string};
  query?: {searchinfo?: {suggestion?: string}; pages?: WikiPage[]};
};

/**
 * The best Wikipedia article for the query, in one request: the list search gives the «did you
 * mean», the generator the page with its Wikidata id and lead image (research C: 9 of 9 people
 * found, about 300 bytes gzipped).
 */
export function wikipediaUrl(query: string, language: string): string {
  const q = encodeURIComponent(normalise(query));
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    'list=search',
    `srsearch=${q}`,
    'srlimit=1',
    'srinfo=suggestion',
    'srprop=',
    'generator=search',
    `gsrsearch=${q}`,
    'gsrlimit=1',
    `prop=${encodeURIComponent('pageprops|pageimages')}`,
    `ppprop=${encodeURIComponent('wikibase_item|disambiguation')}`,
    'piprop=name',
    'redirects=1',
  ];
  return `${WIKIPEDIA_API.replace('{language}', language)}?${params.join('&')}`;
}

/** How many of Wikidata's label matches are checked for a logo. */
const LOGO_CANDIDATES = 5;

/**
 * The items whose label or alias matches the subject, in the order Wikidata's own search box
 * ranks them (#81): «apple» gives the fruit, then Apple Inc. Only for a logo query whose Wikipedia
 * article does not name its subject («apple logo» found the Logo language).
 */
export function logoCandidatesUrl(subject: string, language: string): string {
  const params = [
    'action=wbsearchentities',
    'format=json',
    `search=${encodeURIComponent(subject)}`,
    `language=${encodeURIComponent(language)}`,
    'type=item',
    `limit=${LOGO_CANDIDATES}`,
  ];
  return `${WIKIDATA_API}?${params.join('&')}`;
}

/**
 * Wikidata's SPARQL endpoint: the one form that returns only some properties of several items
 * in one request (#25, owner D11 A). `wbgetentities` has no property filter, and `props=claims`
 * for «apple»'s 5 candidates was 826 KB, Apple Inc. alone 673 KB (measured 2026-11-14).
 */
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

/** Every property the facts and the logo choice read, and nothing else. */
export const READ_PROPERTIES: readonly string[] = [
  ...PICTURE_PROPERTIES,
  INSTANCE_OF,
  SIGNATURE,
  HEADQUARTERS,
  COORDINATES,
  COMMONS_CATEGORY,
];

/**
 * The candidates' statements of the read properties only, in one request: each with its value
 * and rank, so the same rules as for a full entity apply. The ids come from
 * `parseLogoCandidates`, which keeps only `Q<digits>`.
 */
export function claimsUrl(items: readonly string[]): string {
  const values = items.map(id => `wd:${id}`).join(' ');
  const properties = READ_PROPERTIES.map(p => `(p:${p} ps:${p} "${p}")`).join(
    ' ',
  );
  const query =
    'SELECT ?item ?property ?value ?rank WHERE { ' +
    `VALUES ?item { ${values} } ` +
    `VALUES (?p ?ps ?property) { ${properties} } ` +
    '?item ?p ?statement . ?statement ?ps ?value ; wikibase:rank ?rank . }';
  return `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`;
}

type SparqlTerm = {type?: string; value?: string};
type SparqlResponse = {
  results?: {bindings?: Record<string, SparqlTerm | undefined>[]};
};

const ENTITY_IRI = 'http://www.wikidata.org/entity/';
const FILE_IRI = 'http://commons.wikimedia.org/wiki/Special:FilePath/';
/** An unknown value («somevalue») is a generated IRI, or a blank node on older servers. */
const UNKNOWN_IRI = 'http://www.wikidata.org/.well-known/genid/';
const RANKS: Record<string, string> = {
  'http://wikiba.se/ontology#PreferredRank': 'preferred',
  'http://wikiba.se/ontology#NormalRank': 'normal',
  'http://wikiba.se/ontology#DeprecatedRank': 'deprecated',
};

/** A SPARQL value in the shape `wbgetentities` gives it: an item id, a file name or the text. */
function statementOf(value: SparqlTerm, rank?: string): Statement {
  const text = value.value ?? '';
  const unknown = value.type === 'bnode' || text.startsWith(UNKNOWN_IRI);
  if (unknown) {
    return {rank, mainsnak: {snaktype: 'somevalue'}};
  }
  let datavalue: unknown = text;
  if (value.type === 'uri' && text.startsWith(ENTITY_IRI)) {
    datavalue = {id: text.slice(ENTITY_IRI.length)};
  } else if (value.type === 'uri' && text.startsWith(FILE_IRI)) {
    // Commons file names use spaces; the path encodes them.
    datavalue = decodeURIComponent(text.slice(FILE_IRI.length)).replace(
      /_/g,
      ' ',
    );
  }
  return {rank, mainsnak: {snaktype: 'value', datavalue: {value: datavalue}}};
}

/**
 * The candidates' entities from the SPARQL answer, each as `wbgetentities` would give its read
 * properties. shortcut: SPARQL keeps no statement order, so of two statements of the same rank
 * the first is the query's, not the item's; upgrade if a candidate with two normal logos leads
 * with the wrong one.
 */
function parseClaims(text: string): Record<string, Entity> | Failure {
  const data = parseJson<SparqlResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  const bindings = data.results?.bindings;
  if (!Array.isArray(bindings)) {
    return sourceFailure('parse', 'no results in the SPARQL response');
  }
  const entities: Record<string, Entity> = {};
  for (const row of bindings) {
    const item = row.item?.value?.slice(ENTITY_IRI.length);
    const property = row.property?.value;
    if (!item || !property || !row.value) {
      continue;
    }
    const claims = (entities[item] ??= {claims: {}}).claims!;
    const rank = RANKS[row.rank?.value ?? ''];
    (claims[property] ??= []).push(statementOf(row.value, rank));
  }
  return entities;
}

type CandidatesResponse = {
  error?: {code?: string; info?: string};
  search?: {id?: string}[];
};

/** The candidate item ids, in Wikidata's order. */
export function parseLogoCandidates(text: string): string[] | Failure {
  const data = parseJson<CandidatesResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  return (data.search ?? [])
    .map(entry => entry.id)
    .filter((id): id is string => typeof id === 'string' && /^Q\d+$/.test(id));
}

/**
 * The first candidate, in Wikidata's order, that is an organisation or a brand with a logo, as a
 * hit named by the subject: «apple» is Apple Inc., never the fruit, which has no logo.
 */
export function parseLogoItem(
  text: string,
  order: readonly string[],
  subject: string,
): Outcome<{hit: WikiHit; facts: EntityFacts} | null, Failure> {
  const entities = parseClaims(text);
  if (isFailure(entities)) {
    return entities;
  }
  const item = order.find(id => {
    const claims = entities[id]?.claims;
    return leadingLogoOf(claims) !== undefined;
  });
  return {
    ok: true,
    value: item
      ? {
          hit: {title: subject, item, disambiguation: false},
          facts: factsOf([entities[item]]),
        }
      : null,
  };
}

/**
 * The most notable person the name names: Wikidata's full-text search matches the labels of
 * every language («Napoleão Bonaparte» in Portuguese), and the item with the most incoming links
 * comes first (#92).
 */
export function notablePersonUrl(name: string): string {
  const params = [
    'action=query',
    'format=json',
    'formatversion=2',
    'list=search',
    // The style words name no person: «Napoleão portrait» asks for «Napoleão» (#110).
    `srsearch=${encodeURIComponent(
      `${normalise(withoutStyles(name))} haswbstatement:P31=${HUMAN}`,
    )}`,
    'srlimit=1',
    'srprop=',
    'srsort=incoming_links_desc',
  ];
  return `${WIKIDATA_API}?${params.join('&')}`;
}

type PersonResponse = {
  error?: {code?: string; info?: string};
  query?: {search?: {title?: string}[]};
};

/** The person's item id, or null when the search found nobody. */
export function parseNotablePerson(text: string): string | null | Failure {
  const data = parseJson<PersonResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  const id = data.query?.search?.[0]?.title;
  return typeof id === 'string' && /^Q\d+$/.test(id) ? id : null;
}

/** The item's claims, by its id. */
export function entityUrl(item: string): string {
  const params = [
    'action=wbgetentities',
    'format=json',
    `ids=${encodeURIComponent(item)}`,
    'props=claims',
  ];
  return `${WIKIDATA_API}?${params.join('&')}`;
}

export type WikiHit = {
  title: string;
  /** The Wikidata id, when the article has one. */
  item?: string;
  /** The article's lead image, a Commons file name. */
  leadImage?: string;
  disambiguation: boolean;
};

/** The article found, if any, and Wikipedia's «did you mean». */
export type WikiAnswer = {hit: WikiHit | null; suggestion?: string};

export type WikiOutcome = Outcome<WikiAnswer, Failure>;

function parseJson<T>(text: string): T | Failure {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return sourceFailure('parse', 'the response is not JSON');
  }
  if (data === null || typeof data !== 'object') {
    return sourceFailure('parse', 'the response is not a JSON object');
  }
  return data as T;
}

function isFailure(value: unknown): value is Failure {
  return (value as {ok?: unknown}).ok === false;
}

export function parseWikipediaResponse(text: string): WikiOutcome {
  const data = parseJson<WikiResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  if (!data.query && !data.batchcomplete) {
    return sourceFailure('parse', 'neither query nor error in the response');
  }
  const suggestion = data.query?.searchinfo?.suggestion;
  const page = [...(data.query?.pages ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  )[0];
  const hit: WikiHit | null = page?.title
    ? {
        title: page.title,
        item: page.pageprops?.wikibase_item,
        leadImage: page.pageimage,
        disambiguation: page.pageprops?.disambiguation !== undefined,
      }
    : null;
  return {ok: true, value: {hit, ...(suggestion && {suggestion})}};
}

/** The preferred statement's value, else the first normal one; deprecated ones never. */
function valueOf(statements: Statement[] = []): unknown {
  const usable = statements.filter(
    s => s.rank !== 'deprecated' && s.mainsnak?.snaktype === 'value',
  );
  const chosen = usable.find(s => s.rank === 'preferred') ?? usable[0];
  return chosen?.mainsnak?.datavalue?.value;
}

function fileOf(statements?: Statement[]): string | undefined {
  const value = valueOf(statements);
  return typeof value === 'string' ? value : undefined;
}

/** Whether one of the item's classes (P31) is in `classes`. */
function isInstance(
  statements: Statement[] = [],
  classes: ReadonlySet<string>,
): boolean {
  return statements.some(s => {
    const value = s.mainsnak?.datavalue?.value as {id?: unknown} | undefined;
    return (
      s.rank !== 'deprecated' &&
      typeof value?.id === 'string' &&
      classes.has(value.id)
    );
  });
}

const HUMANS: ReadonlySet<string> = new Set([HUMAN]);

function isOrganisation(claims: Record<string, Statement[]> = {}): boolean {
  return valueOf(claims[HEADQUARTERS]) !== undefined;
}

/** The logo that leads the page: an organisation's, or any item's but a person's or a place's. */
function leadingLogoOf(
  claims: Record<string, Statement[]> = {},
): string | undefined {
  const logo = fileOf(claims[LOGO]);
  const leads =
    isOrganisation(claims) ||
    (!isInstance(claims[INSTANCE_OF], HUMANS) &&
      valueOf(claims[COORDINATES]) === undefined);
  return leads ? logo : undefined;
}

/** What an item's claims say about its pictures and kind. */
export type EntityFacts = {
  files: string[];
  human: boolean;
  /** The item is a given or family name, not the person (#92). */
  name?: true;
  signature?: string;
  /** The item's own flag (P41): it leads the page (#89). */
  flag?: string;
  /** A person's own image (P18): it leads the page unless a drawing names them plainly (#15). */
  portrait?: string;
  /** The logo file, when the item is an organisation or a brand: it leads the page (#81). */
  leadingLogo?: string;
  /** An organisation with no logo: the Commons category whose «logos» child holds it (#92). */
  logoCategory?: string;
};

export type EntityOutcome = Outcome<EntityFacts, Failure>;

/**
 * The Commons file names of the item's pictures, whether it is a person, its signature and its
 * own flag.
 */
export function parseEntityResponse(
  text: string,
  only?: string,
): EntityOutcome {
  const data = parseJson<EntityResponse>(text);
  if (isFailure(data)) {
    return data;
  }
  if (data.error) {
    return apiFailure(data.error);
  }
  if (!data.entities) {
    return sourceFailure('parse', 'no entities in the response');
  }
  // One item of a response that holds several.
  const entities =
    only === undefined
      ? Object.values(data.entities)
      : [data.entities[only] ?? {missing: ''}];
  return {ok: true, value: factsOf(entities)};
}

/** What the entities' claims say, read together: an article's item, or one logo candidate. */
function factsOf(entities: readonly Entity[]): EntityFacts {
  const files: string[] = [];
  let human = false;
  let name = false;
  let signature: string | undefined;
  let flag: string | undefined;
  let portrait: string | undefined;
  let leadingLogo: string | undefined;
  let logoCategory: string | undefined;
  for (const entity of entities) {
    if (entity.missing !== undefined) {
      continue;
    }
    flag ??= fileOf(entity.claims?.[FLAG]);
    for (const property of PICTURE_PROPERTIES) {
      const file = fileOf(entity.claims?.[property]);
      if (file && !files.includes(file)) {
        files.push(file);
      }
    }
    if (isInstance(entity.claims?.[INSTANCE_OF], HUMANS)) {
      human = true;
      portrait ??= fileOf(entity.claims?.[IMAGE]);
    }
    name ||= isInstance(entity.claims?.[INSTANCE_OF], NAMES);
    signature ??= fileOf(entity.claims?.[SIGNATURE]);
    leadingLogo ??= leadingLogoOf(entity.claims);
    if (isOrganisation(entity.claims) && !fileOf(entity.claims?.[LOGO])) {
      logoCategory ??= fileOf(entity.claims?.[COMMONS_CATEGORY]);
    }
  }
  return {
      files: files.filter(file => file !== signature),
      human,
      ...(name && {name: true as const}),
      ...(signature && {signature}),
      ...(flag && flag !== signature && {flag}),
      ...(portrait && portrait !== signature && {portrait}),
      ...(leadingLogo && {leadingLogo}),
      ...(!leadingLogo && logoCategory && {logoCategory}),
  };
}

/** The Commons search for the files of an organisation's «logos» category (#92). */
export function logoCategorySearch(category: string): string {
  return `incategory:"${category.replace(/ /g, '_')}_logos"`;
}

/**
 * Whether the article can be the query's: a query that names a style («apple logo») must find an
 * article naming its subject, or the style word alone finds one («Logo (programming language)»,
 * whose turtle curve then led page 1, #81). Without a style word, the search's spelling tolerance
 * decides («elephent»).
 */
export function isQueryArticle(query: string, title: string): boolean {
  return readIntent(query).styles.size === 0 || namesSubject(query, title);
}

/** Whether the title names a word of the query's subject, plural and accents aside (#110). */
function namesSubject(query: string, title: string): boolean {
  // «cats drawing» is the article «Cat».
  const have = words(withoutAccents(title));
  return readIntent(query)
    .subject.map(withoutAccents)
    .some(q => have.some(word => sameWord(word, q) || sameWord(q, word)));
}

/** The organisation or brand a logo query names, with what its read properties say. */
type LogoFind = Outcome<{hit: WikiHit; facts: EntityFacts} | null, Failure>;

/**
 * For a logo query, the organisation or brand its subject names, with its logo; for any other,
 * none (#81). Two requests: Wikidata's label search, then its candidates' claims.
 */
async function findLogoItem(
  query: string,
  language: string,
  ctx: SourceContext,
): Promise<LogoFind> {
  const {subject, styles} = readIntent(query);
  if (!styles.has('logo') || subject.length === 0) {
    return {ok: true, value: null};
  }
  const named = subject.join(' ');
  const headers = {'Api-User-Agent': ctx.userAgent};
  const found = await ctx.fetch(logoCandidatesUrl(named, language), headers);
  if (!found.ok) {
    return found;
  }
  const order = parseLogoCandidates(found.value);
  if (isFailure(order) || order.length === 0) {
    return isFailure(order) ? order : {ok: true, value: null};
  }
  const claims = await ctx.fetch(claimsUrl(order), headers);
  if (!claims.ok) {
    return claims;
  }
  return parseLogoItem(claims.value, order, named);
}

/** The logo query's item when the Wikipedia article did not name the subject (#81). */
async function logoItem(
  query: string,
  language: string,
  ctx: SourceContext,
): Promise<LookupOutcome> {
  const found = await findLogoItem(query, language, ctx);
  return found.ok
    ? {
        ok: true,
        value: {
          hit: found.value?.hit ?? null,
          language,
          ...(found.value && {facts: found.value.facts}),
        },
      }
    : found;
}

/**
 * The article found and the language of the Wikipedia that found it; for the logo path, the
 * item's facts already read, so its full entity is never fetched (#25).
 */
type LookupOutcome = Outcome<
  WikiAnswer & {language?: string; facts?: EntityFacts},
  Failure
>;

/**
 * Whether the article's title is the query's subject itself, plural and accents aside, with any
 * «(fruit)» qualifier left out: «Apple» for «apple», not «Apple Inc.» (#13).
 */
export function isTitleOfQuery(query: string, title: string): boolean {
  const subject = readIntent(query).subject.map(withoutAccents);
  const have = words(withoutAccents(title.replace(/\s*\([^)]*\)\s*$/, '')));
  return (
    have.length > 0 &&
    have.length === subject.length &&
    have.every((word, i) => sameWord(word, subject[i]) || sameWord(subject[i], word))
  );
}

/**
 * The article for the query, and the language of the Wikipedia that found it. Every language is
 * asked at once (the budget already counts one request each). In the languages' order, the first
 * article whose title is the query itself wins; else the first article, as before (#13): a plain
 * English word searched in another Wikipedia finds a brand first («apple» in Portuguese is
 * «Apple Inc.», whose logo then led Lookup's page 1), while its own Wikipedia names the thing.
 * When the Wikipedias found different items and the query asks for no logo, a brand or an
 * organisation is chosen only when every article found is one: the Portuguese article titled
 * «Apple» is the company and «Brazil (filme)» a film with a logo, so a title match alone kept
 * the brand first (#13, lab run `lookup-183`). Their read properties come in one request, and
 * stand in for the chosen item's entity request. A failure before any article stops the walk.
 */
async function lookup(
  query: string,
  ctx: SourceContext,
): Promise<LookupOutcome> {
  const languages = lookupLanguages(query, ctx.languages);
  // A written line's check already found this article (#87): it wins, and no Wikipedia is asked.
  for (const language of languages) {
    const known = knownHit(query, language);
    if (known) {
      return {ok: true, value: {hit: known, language}};
    }
  }
  const answers = await Promise.all(
    languages.map(async language => {
      const response = await ctx.fetch(wikipediaUrl(query, language), {
        'Api-User-Agent': ctx.userAgent,
      });
      return {
        language,
        found: response.ok ? parseWikipediaResponse(response.value) : response,
      };
    }),
  );
  const found: Candidate[] = [];
  let suggestion: string | undefined;
  for (const {language, found: answer} of answers) {
    if (!answer.ok) {
      if (found.length === 0) {
        return answer;
      }
      break;
    }
    const {hit} = answer.value;
    if (!hit) {
      suggestion ??= answer.value.suggestion;
      continue;
    }
    found.push({language, answer: {...answer.value, hit}});
  }
  if (found.length === 0) {
    return {ok: true, value: {hit: null, ...(suggestion && {suggestion})}};
  }
  const facts = await itemFacts(query, found, ctx);
  const plain = facts && found.filter(c => !isBrand(facts, c.answer.hit.item));
  const chosen = choose(query, plain && plain.length > 0 ? plain : found);
  const item = chosen.answer.hit.item;
  if (!isQueryArticle(query, chosen.answer.hit.title)) {
    return logoItem(query, chosen.language, ctx);
  }
  return {
    ok: true,
    value: {
      ...chosen.answer,
      language: chosen.language,
      ...(facts && item && {facts: factsOf([facts[item] ?? {claims: {}}])}),
    },
  };
}

/** An article one language's Wikipedia found. */
type Candidate = {language: string; answer: WikiAnswer & {hit: WikiHit}};

/** In the languages' order, the first article titled as the query, else the first. */
function choose(query: string, found: readonly Candidate[]): Candidate {
  return (
    found.find(
      c =>
        isQueryArticle(query, c.answer.hit.title) &&
        isTitleOfQuery(query, c.answer.hit.title),
    ) ?? found[0]
  );
}

/**
 * The read properties of the items the Wikipedias found, when they found more than one and the
 * query asks for no logo; else, or when the request fails, none, and the first rule decides.
 */
async function itemFacts(
  query: string,
  found: readonly Candidate[],
  ctx: SourceContext,
): Promise<Record<string, Entity> | undefined> {
  const items = [
    ...new Set(
      found
        .filter(c => !c.answer.hit.disambiguation)
        .map(c => c.answer.hit.item)
        .filter((id): id is string => id !== undefined && /^Q\d+$/.test(id)),
    ),
  ];
  if (items.length < 2 || readIntent(query).styles.has('logo')) {
    return undefined;
  }
  const response = await ctx.fetch(claimsUrl(items), {
    'Api-User-Agent': ctx.userAgent,
  });
  const entities = response.ok ? parseClaims(response.value) : response;
  if (isFailure(entities)) {
    ctx.log(`wikidata: the claims of ${items.join(', ')}: ${entities.message}`);
    return undefined;
  }
  return entities;
}

/** Whether the item is an organisation, or a brand whose logo would lead the page. */
function isBrand(entities: Record<string, Entity>, item?: string): boolean {
  const claims = item === undefined ? undefined : entities[item]?.claims;
  return isOrganisation(claims) || leadingLogoOf(claims) !== undefined;
}

/** A spelling to try when nothing was found: Wikipedia's «did you mean», else its article title. */
function suggestionOf(query: string, found: WikiAnswer) {
  const candidate = found.suggestion ?? found.hit?.title;
  return candidate &&
    candidate.toLocaleLowerCase() !== normalise(query).toLocaleLowerCase()
    ? {suggestion: candidate}
    : {};
}

/** The item's pictures and kind, in one request. */
async function entityOf(
  item: string,
  ctx: SourceContext,
): Promise<EntityOutcome> {
  const response = await ctx.fetch(entityUrl(item), {
    'Api-User-Agent': ctx.userAgent,
  });
  return response.ok ? parseEntityResponse(response.value) : response;
}

/** The most notable person a name names, when there is one. */
async function notablePerson(
  name: string,
  ctx: SourceContext,
): Promise<Outcome<string | undefined, Failure>> {
  const response = await ctx.fetch(notablePersonUrl(name), {
    'Api-User-Agent': ctx.userAgent,
  });
  if (!response.ok) {
    return response;
  }
  const found = parseNotablePerson(response.value);
  return isFailure(found) ? found : {ok: true, value: found || undefined};
}

export async function searchWikidata(
  query: string,
  ctx: SourceContext,
): Promise<SourceOutcome> {
  const found = await lookup(query, ctx);
  if (!found.ok) {
    return found;
  }
  const {hit} = found.value;
  const suggestion = suggestionOf(query, found.value);
  if (!hit || hit.disambiguation) {
    return {ok: true, value: {results: [], ...suggestion}};
  }
  let files: string[] = [];
  let human = false;
  let signature: string | undefined;
  let flag: string | undefined;
  let portrait: string | undefined;
  let leadingLogo: string | undefined;
  let logoCategory: string | undefined;
  let item = hit.item;
  let leadImage = hit.leadImage;
  // A person found by the article's text only is not the one asked for: «cadeira» found the
  // article of a senator, whose portrait must not lead a chair (#15).
  let named = namesSubject(query, hit.title);
  // The query is a name many people bear, resolved to its most notable bearer (#92).
  let byName = false;
  if (found.value.facts && !found.value.facts.name) {
    // The logo path, or the choice among the Wikipedias' items, read the item's facts: no
    // request for its entity. A name still takes the namesake path below.
    ({files, human, signature, flag, portrait, leadingLogo, logoCategory} =
      found.value.facts);
  } else if (item) {
    let entity = await entityOf(item, ctx);
    if (entity.ok && entity.value.name) {
      // The article is the name's: the most notable person it names is the subject (#92).
      const person = await notablePerson(query, ctx);
      if (!person.ok) {
        return person;
      }
      if (person.value) {
        named = true;
        byName = true;
        item = person.value;
        leadImage = undefined;
        entity = await entityOf(item, ctx);
      }
    }
    if (!entity.ok) {
      return entity;
    }
    ({files, human, signature, flag, portrait, leadingLogo, logoCategory} =
      entity.value);
  }
  if (!leadingLogo && !logoCategory && found.value.language) {
    // A logo query whose article names the subject but leads with no logo: «apple logo» found
    // «Marketing of Apple Inc.», an item with no claims, so Wikidata's label search names the
    // brand (#81). Its facts come from the candidates' claims: no request more.
    const logo = await findLogoItem(query, found.value.language, ctx);
    if (!logo.ok) {
      return logo;
    }
    if (logo.value && logo.value.hit.item !== item) {
      item = logo.value.hit.item;
      leadImage = undefined;
      ({files, human, signature, flag, portrait, leadingLogo, logoCategory} =
        logo.value.facts);
    }
  }
  if (leadImage) {
    // The lead image uses underscores; Commons file names use spaces.
    const lead = leadImage.replace(/_/g, ' ');
    if (!files.includes(lead) && lead !== signature) {
      files.push(lead);
    }
  }
  const none = Promise.resolve<SourceOutcome>({ok: true, value: {results: []}});
  const [pictures, gallery, logos] = await Promise.all([
    commonsFiles(files, ctx),
    human && item
      ? commonsSearch(`haswbstatement:P180=${item} filetype:bitmap`, ctx)
      : none,
    logoCategory ? commonsSearch(logoCategorySearch(logoCategory), ctx) : none,
  ]);
  if (!pictures.ok) {
    return pictures;
  }
  if (!gallery.ok) {
    ctx.log(`wikidata: depicts gallery of ${item}: ${gallery.message}`);
  }
  if (!logos.ok) {
    ctx.log(`wikidata: logos of ${item}: ${logos.message}`);
  }
  // An organisation with no logo on its item leads with its Commons category's first logo (#92).
  const categoryLogo = logos.ok ? logos.value.results[0] : undefined;
  const signed = (title: string) =>
    signature !== undefined && title === withoutExtension(signature);
  // A country's own flag leads, before regional and other flags (#89); so does an
  // organisation's or a brand's own logo (#81).
  const leads = (title: string) =>
    (flag !== undefined && title === withoutExtension(flag)) ||
    (leadingLogo !== undefined && title === withoutExtension(leadingLogo));
  return {
    ok: true,
    value: {
      results: [
        ...(categoryLogo
          ? [{...categoryLogo, canonical: true, leads: true as const}]
          : []),
        ...pictures.value.results.map(result => ({
          ...result,
          canonical: true,
          ...(leads(result.title) && {leads: true as const}),
          ...(named &&
            portrait !== undefined &&
            result.title === withoutExtension(portrait) && {
              portrait: true as const,
            }),
        })),
        ...(gallery.ok ? gallery.value.results : [])
          .filter(r => !signed(r.title))
          // Only for a name: its gallery's titles use other forms of it («Napoleon I» for
          // «Napoleão») and Commons' own search finds its other bearers (#15).
          .map(r => (byName ? {...r, depicts: true as const} : r)),
      ],
      ...suggestion,
    },
  };
}

/** A Commons file name without its extension: the result's title. */
function withoutExtension(file: string): string {
  return file.replace(/\.[^.]+$/, '');
}

/**
 * The requests after the articles, in a row: the entity, the namesake and its entity, then the
 * Commons files; the logo path's two requests, the label search and the candidates' read
 * properties, replace the namesake's two (#92, #110), and the entity's own, since the
 * candidates' answer holds the chosen item's facts (#25, #81).
 */
const CHAIN_REQUESTS = 4;

/**
 * The article and its item, the claims, then the files with the people gallery beside them; it
 * only adds pictures to the other sources.
 */
export const wikidataAdapter: SourceAdapter = {
  name: 'wikidata',
  search: searchWikidata,
  requests: ctx => ctx.languages.length + CHAIN_REQUESTS,
  supplement: true,
};
