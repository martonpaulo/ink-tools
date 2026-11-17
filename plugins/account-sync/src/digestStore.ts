/**
 * The tablet's Digest as Account Sync's Saved target (#42), over `ContentRows`, the same four
 * provider calls the Calendar and To-Do stores use (`deviceStores.ts`). Every path, column and limit
 * is sn-adapter's descriptor and mappers; this file only joins them, so it is tested with an
 * in-memory provider and no device.
 *
 * The write is one-way and idempotent (docs/research/2026-11-digest-provider.md#6-what-a-saved-item-becomes):
 * each entry is counted by its identifier first, then inserted or updated. The provider refuses
 * every delete to a plugin, so an entry removed at the source stays in the Digest.
 */
import {
  BUNDLED_DESCRIPTOR,
  Descriptor,
  DigestEntry,
  digestCountUri,
  digestInsertUri,
  digestUpdateUri,
  toDigestInsert,
  toDigestUpdate,
} from '@ink-tools/sn-adapter';
import type {ContentRows} from './deviceStores';

/**
 * The one column `knowledge/count/by_unique_identifier/<id>` answers
 * (docs/research/2026-11-digest-provider.md#3-content-uris).
 */
const COUNT_COLUMN = 'count';

export interface DigestWriteResult {
  inserted: number;
  updated: number;
  /** Each entry the provider refused or the mapper rejected, with the reason; the others still ran. */
  failed: Array<{sourceId: string; reason: string}>;
}

export interface DeviceDigest {
  write(entries: DigestEntry[]): Promise<DigestWriteResult>;
}

/**
 * `collection` is a Digest collection's `unique_attribute`; empty writes into the default one.
 * shortcut: no «Saved» collection is found or created yet, so entries go to the collection given;
 * upgrade when the Saved module lands with its `knowledge_base` lookup (#42).
 */
export function createDeviceDigest(
  rows: ContentRows,
  collection = '',
  d: Descriptor = BUNDLED_DESCRIPTOR,
): DeviceDigest {
  const countOf = async (entry: DigestEntry): Promise<number> => {
    const answer = await rows.query(digestCountUri(d, entry.sourceId), {});
    const count = answer[0]?.[COUNT_COLUMN];
    // A missing or non-numeric count is a failure, never «not there yet», or every run would duplicate.
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error(`the Digest answered no count for ${entry.sourceId}: ${JSON.stringify(answer)}`);
    }
    return count;
  };

  return {
    async write(entries) {
      const result: DigestWriteResult = {inserted: 0, updated: 0, failed: []};
      for (const entry of entries) {
        try {
          if ((await countOf(entry)) === 0) {
            await rows.insert(digestInsertUri(d), toDigestInsert(d, entry, collection));
            result.inserted += 1;
          } else {
            const changed = await rows.update(digestUpdateUri(d), {}, toDigestUpdate(d, entry, collection));
            if (changed === 0) {throw new Error(`the Digest changed no entry for ${entry.sourceId}`);}
            result.updated += 1;
          }
        } catch (error) {
          result.failed.push({sourceId: entry.sourceId, reason: error instanceof Error ? error.message : String(error)});
        }
      }
      return result;
    },
  };
}
