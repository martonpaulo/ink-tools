import {
  BUNDLED_DESCRIPTOR as D,
  DigestEntry,
  digestCountUri,
  digestIdentifier,
  digestInsertUri,
  digestUpdateUri,
  toDigestInsert,
  toDigestUpdate,
} from '../src';

const entry = (over: Partial<DigestEntry> = {}): DigestEntry => ({
  sourceId: 'a1b2-c3',
  title: 'A page title',
  text: 'The excerpt.',
  url: 'https://example.com/article',
  savedAt: 1_700_000_000_000,
  ...over,
});

test('the URIs are the provider paths a plugin may call (#42)', () => {
  const base = 'content://com.ratta.supernote.knowledge.provider';
  expect(digestInsertUri(D)).toBe(`${base}/knowledge/insert`);
  expect(digestCountUri(D, 'a1b2-c3')).toBe(`${base}/knowledge/count/by_unique_identifier/inktools-saved-a1b2-c3`);
  expect(digestUpdateUri(D)).toBe(`${base}/knowledge/update/by_unique_identifier`);
});

test('an insert is a self-added entry with compact identifier metadata', () => {
  expect(toDigestInsert(D, entry(), 'kb-1')).toEqual({
    content: 'A page title\n\nThe excerpt.',
    source_type: 4,
    metadata: '{"unique_identifier":"inktools-saved-a1b2-c3"}',
    comment_str: 'https://example.com/article',
    creation_time: 1_700_000_000_000,
    knowledge_base_unique_attribute: 'kb-1',
  });
});

test('the default collection sends no collection key', () => {
  expect(toDigestInsert(D, entry(), '')).not.toHaveProperty('knowledge_base_unique_attribute');
});

test('content longer than the provider takes is cut, never inside a surrogate pair', () => {
  const max = D.digest.rules.contentMaxLength;
  const long = toDigestInsert(D, entry({title: '', text: 'x'.repeat(max + 10)}), '').content as string;
  expect(long.length).toBe(max);
  expect(long.endsWith('…')).toBe(true);
  const emoji = toDigestInsert(D, entry({title: '', text: `${'x'.repeat(max - 2)}😀tail`}), '').content as string;
  expect(emoji.length).toBeLessThanOrEqual(max);
  expect(emoji).toBe(`${'x'.repeat(max - 2)}…`);
});

test('an entry with no text, or an address the provider would refuse, is an error', () => {
  expect(() => toDigestInsert(D, entry({title: ' ', text: ''}), '')).toThrow(/no title and no text/);
  const url = `https://example.com/${'a'.repeat(D.digest.rules.commentMaxLength)}`;
  expect(() => toDigestInsert(D, entry({url}), '')).toThrow(/address over/);
});

test('an identifier with a LIKE wildcard or a quote is refused', () => {
  for (const bad of ['a_b', '50%', 'a"b', '']) expect(() => digestIdentifier(bad)).toThrow(/letters, digits/);
});

test('an update names the entry by identifier and keeps its creation time', () => {
  const row = toDigestUpdate(D, entry(), 'kb-1');
  expect(row.knowledge_unique_identifier).toBe('inktools-saved-a1b2-c3');
  expect(row).not.toHaveProperty('creation_time');
  expect(row.content).toBe('A page title\n\nThe excerpt.');
});
