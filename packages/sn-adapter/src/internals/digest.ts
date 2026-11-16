import {Descriptor, column} from './descriptor';
import {Row} from './rules';

/**
 * One item to keep in the Digest, the shape Account Sync's Saved module hands over (#42). The
 * provider stores text only, so a picture travels as its address in `url`
 * (docs/research/2026-11-digest-provider.md#7-pictures).
 */
export interface DigestEntry {
  /** The source's stable id; it becomes the entry's identifier, so a second write is an update. */
  sourceId: string;
  title: string;
  text: string;
  url: string;
  /** When the item was saved, in ms; 0 lets the provider use the time of the insert. */
  savedAt: number;
}

/** Our identifiers start with this, so an entry the sync wrote is never confused with the owner's. */
export const DIGEST_IDENTIFIER_PREFIX = 'inktools-saved-';

/**
 * The provider finds an entry with `metadata LIKE '%"unique_identifier":"<id>"%'`, so `%` and `_`
 * would act as wildcards and a quote would end the match; only letters, digits and `-` are safe.
 */
const SAFE_ID = /^[A-Za-z0-9-]+$/;

export function digestIdentifier(sourceId: string): string {
  if (!SAFE_ID.test(sourceId)) throw new Error(`Digest source id ${JSON.stringify(sourceId)} must hold only letters, digits and -`);
  return DIGEST_IDENTIFIER_PREFIX + sourceId;
}

const uri = (d: Descriptor, path: string) => `content://${d.digest.authority}/${path}`;

/** Where a new entry is inserted; the `knowledge` read path refuses inserts. */
export function digestInsertUri(d: Descriptor): string {
  return uri(d, d.digest.rules.insertPath);
}

/** Answers one `count` column: above 0 means the entry is already in the Digest. */
export function digestCountUri(d: Descriptor, sourceId: string): string {
  return uri(d, `${d.digest.rules.countByIdentifierPath}/${digestIdentifier(sourceId)}`);
}

export function digestUpdateUri(d: Descriptor): string {
  return uri(d, d.digest.rules.updateByIdentifierPath);
}

/** Cut to `max` UTF-16 units, as Java's `String.length` counts them, never inside a surrogate pair. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

function entryContent(d: Descriptor, entry: DigestEntry): string {
  const parts = [entry.title.trim(), entry.text.trim()].filter(p => p !== '');
  // The provider refuses empty content; an entry with nothing to show is an error, not a blank row.
  if (!parts.length) throw new Error(`Digest entry ${entry.sourceId} has no title and no text`);
  return cut(parts.join('\n\n'), d.digest.rules.contentMaxLength);
}

/** The values of one insert into `digestInsertUri`, inside the provider's limits. */
export function toDigestInsert(d: Descriptor, entry: DigestEntry, collection: string): Row {
  const r = d.digest.rules;
  const col = (field: string) => column(d.digest, 'knowledge', field);
  const url = entry.url.trim();
  // A cut address would point somewhere else; refuse it instead.
  if (url.length > r.commentMaxLength) throw new Error(`Digest entry ${entry.sourceId} has an address over ${r.commentMaxLength} characters`);
  const row: Row = {
    [col('content')]: entryContent(d, entry),
    [col('sourceType')]: r.sourceTypeSelfAdd,
    // Compact JSON, as the provider's LIKE lookup expects `"key":"value"` with no space.
    [col('metadata')]: JSON.stringify({[r.identifierKey]: digestIdentifier(entry.sourceId)}),
    [col('comment')]: url,
    [col('created')]: entry.savedAt > 0 ? entry.savedAt : 0,
  };
  // An empty collection is the Digest's default one, which the provider takes when the key is absent.
  if (collection !== '') row[col('collection')] = collection;
  return row;
}

/** The values of one update into `digestUpdateUri`: the same content, named by its identifier. */
export function toDigestUpdate(d: Descriptor, entry: DigestEntry, collection: string): Row {
  const {[column(d.digest, 'knowledge', 'created')]: _created, ...row} = toDigestInsert(d, entry, collection);
  return {...row, [d.digest.rules.updateIdentifierKey]: digestIdentifier(entry.sourceId)};
}
