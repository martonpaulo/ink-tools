import {readFileSync} from 'fs';
import {join} from 'path';
import {
  PACK_CATALOG_PATH,
  PACK_STORE_FOLDER,
  RemotePack,
  installPack,
  openPack,
  parseInstalledCatalog,
  parseRemoteCatalog,
  readInstalled,
  removePack,
  storePath,
} from '../src';
import {REGISTRY} from '@ink-tools/sn-adapter/registry';
import {fakeHost} from '../testing/host';

const FIXTURE = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'en-1.pack')));
const FIXTURE_SHA = '6d95ea297eedbabd917b1103852f3e90fac6ac864c1840f3544660883eec5b7f';
const URL = 'https://example.test/packs/en-1.pack';

const pack = (overrides: Partial<RemotePack> = {}): RemotePack => ({
  language: 'en',
  version: '1',
  size: FIXTURE.length,
  sha256: FIXTURE_SHA,
  licence: 'CC BY-SA 4.0',
  url: URL,
  ...overrides,
});

describe('the pack store', () => {
  it('lives in the shared folder of the registry', () => {
    expect(PACK_STORE_FOLDER.startsWith(`${REGISTRY.storageSharedFolder.folder}/`)).toBe(true);
  });

  it('downloads a fixture pack, checks its SHA-256 and writes the catalog entry', async () => {
    const host = fakeHost({[URL]: FIXTURE});
    const installed = await installPack(host, pack());
    expect(installed).toEqual({
      ok: true,
      value: {language: 'en', version: '1', size: 65, sha256: FIXTURE_SHA, licence: 'CC BY-SA 4.0', file: 'en-1.pack'},
    });
    expect(host.files.get(storePath('en-1.pack'))).toEqual(FIXTURE);
    const catalog = await readInstalled(host);
    expect(catalog.ok && catalog.value.packs.map(p => [p.language, p.version, p.size, p.sha256, p.licence])).toEqual([
      ['en', '1', 65, FIXTURE_SHA, 'CC BY-SA 4.0'],
    ]);
    expect([...host.files.keys()].sort()).toEqual([PACK_CATALOG_PATH, storePath('en-1.pack')].sort());
  });

  it('refuses a pack whose hash differs and keeps nothing of it', async () => {
    const host = fakeHost({[URL]: FIXTURE});
    const refused = await installPack(host, pack({sha256: 'a'.repeat(64)}));
    expect(refused).toMatchObject({ok: false, code: 'HASH_MISMATCH'});
    expect(host.files.size).toBe(0);
    expect(await readInstalled(host)).toEqual({ok: true, value: {packs: []}});
  });

  it('refuses a pack whose size differs from the catalog', async () => {
    const host = fakeHost({[URL]: FIXTURE});
    expect(await installPack(host, pack({size: 64}))).toMatchObject({ok: false, code: 'SIZE_MISMATCH'});
    expect(host.files.size).toBe(0);
  });

  it('refuses a pack over the size limit before any download', async () => {
    const host = fakeHost({[URL]: FIXTURE});
    expect(await installPack(host, pack({size: 2 ** 40}))).toMatchObject({ok: false, code: 'TOO_LARGE'});
    expect(host.calls.filter(call => call.startsWith('download'))).toEqual([]);
  });

  it('reports a failed download, never an installed pack', async () => {
    const host = fakeHost({});
    expect(await installPack(host, pack())).toMatchObject({ok: false, code: 'HOST'});
    expect(host.files.size).toBe(0);
  });

  it('replaces an older version and deletes its file', async () => {
    const newer = new TextEncoder().encode('version two\n');
    const {createHash} = await import('crypto');
    const host = fakeHost({[URL]: FIXTURE, 'https://example.test/packs/en-2.pack': newer});
    await installPack(host, pack());
    const second = await installPack(host, pack({
      version: '2',
      size: newer.length,
      sha256: createHash('sha256').update(newer).digest('hex'),
      url: 'https://example.test/packs/en-2.pack',
    }));
    expect(second.ok).toBe(true);
    expect(host.files.has(storePath('en-1.pack'))).toBe(false);
    const catalog = await readInstalled(host);
    expect(catalog.ok && catalog.value.packs.map(p => p.version)).toEqual(['2']);
  });

  it('checks a pack by its hash before use and refuses changed bytes', async () => {
    const host = fakeHost({[URL]: FIXTURE});
    await installPack(host, pack());
    expect(await openPack(host, 'en')).toMatchObject({ok: true, value: {path: storePath('en-1.pack')}});
    const changed = FIXTURE.slice();
    changed[0] ^= 1;
    host.files.set(storePath('en-1.pack'), changed);
    expect(await openPack(host, 'en')).toMatchObject({ok: false, code: 'HASH_MISMATCH'});
    expect(await openPack(host, 'pt')).toMatchObject({ok: false, code: 'NOT_INSTALLED'});
  });

  it('removes a pack and its entry, giving the bytes freed', async () => {
    const host = fakeHost({[URL]: FIXTURE});
    await installPack(host, pack());
    expect(await removePack(host, 'en')).toEqual({ok: true, value: 65});
    expect(host.files.has(storePath('en-1.pack'))).toBe(false);
    expect(await readInstalled(host)).toEqual({ok: true, value: {packs: []}});
  });
});

describe('the catalogs', () => {
  it('reads a remote catalog and fails it whole on one bad entry', () => {
    const good = {language: 'pt-BR', version: '2026.11', size: 4, sha256: 'b'.repeat(64), licence: 'CC BY 2.0 FR', url: URL};
    expect(parseRemoteCatalog(JSON.stringify({packs: [good]}))).toEqual({ok: true, value: [good]});
    expect(parseRemoteCatalog(JSON.stringify({packs: [good, {...good, sha256: 'xyz'}]}))).toMatchObject({
      ok: false,
      code: 'BAD_CATALOG',
    });
    expect(parseRemoteCatalog(JSON.stringify({packs: [{...good, url: 'http://example.test/a.pack'}]}))).toMatchObject({
      ok: false,
      code: 'BAD_CATALOG',
    });
    expect(parseRemoteCatalog('not json')).toMatchObject({ok: false, code: 'BAD_CATALOG'});
  });

  it('reads a missing installed catalog as an empty store and a broken one as a failure', () => {
    expect(parseInstalledCatalog(null)).toEqual({ok: true, value: {packs: []}});
    expect(parseInstalledCatalog('{"packs": 3}')).toMatchObject({ok: false, code: 'BAD_CATALOG'});
  });
});
