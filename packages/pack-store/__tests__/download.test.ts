import {readFileSync} from 'fs';
import {join} from 'path';
import {
  InstalledCatalog,
  PACK_CONFIG,
  PACK_REQUIREMENTS,
  PackNeedsHost,
  PackQuestion,
  RemotePack,
  downloadPack,
  missingForUse,
  prepareDownload,
} from '../src';
import {fakeHost} from '../testing/host';

const FIXTURE = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'en-1.pack')));
const SHA = '6d95ea297eedbabd917b1103852f3e90fac6ac864c1840f3544660883eec5b7f';
const URL = 'https://example.test/packs/en-2.pack';
const PACK: RemotePack = {language: 'en', version: '2', size: FIXTURE.length, sha256: SHA, licence: 'CC BY-SA 4.0', url: URL};
const OLD: InstalledCatalog = {packs: [{...PACK, version: '1', size: 40, sha256: 'c'.repeat(64), file: 'en-1.pack'}]};
const EMPTY: InstalledCatalog = {packs: []};

const needs = (overrides: Partial<{online: boolean; metered: boolean; shared: boolean; free: number | null}> = {}): PackNeedsHost => {
  const state = {online: true, metered: false, shared: true, free: 10 * PACK_CONFIG.freeSpaceMarginBytes, ...overrides};
  return {
    online: async () => state.online,
    metered: async () => state.metered,
    sharedFolder: async () => state.shared,
    freeBytes: async () => state.free,
  };
};

describe('the pack download', () => {
  it('declares its requirements in data', () => {
    expect(PACK_REQUIREMENTS).toEqual({download: ['network', 'shared-folder', 'free-space'], use: ['shared-folder']});
  });

  it('shows the size first and fetches nothing before a yes', async () => {
    const host = fakeHost({[URL]: FIXTURE});
    const asked: PackQuestion[] = [];
    const end = await downloadPack(PACK, {host, needs: needs(), installed: EMPTY, ask: async q => (asked.push(q), false)});
    expect(end).toEqual({ok: true, value: {kind: 'declined'}});
    expect(asked).toEqual([{pack: PACK, bytes: 65, replaces: null, metered: false}]);
    expect(host.calls.filter(call => call.startsWith('download'))).toEqual([]);
  });

  it('installs after a yes', async () => {
    const host = fakeHost({[URL]: FIXTURE});
    const end = await downloadPack(PACK, {host, needs: needs(), installed: EMPTY, ask: async () => true});
    expect(end).toEqual({ok: true, value: {kind: 'installed'}});
  });

  it('shows the size of a new version again, with the version it replaces', async () => {
    expect(await prepareDownload(PACK, OLD, needs(), {language: 'en', version: '1'})).toEqual({
      kind: 'ask',
      question: {pack: PACK, bytes: 65, replaces: '1', metered: false},
    });
  });

  it('asks again on a metered network even after a yes for this version', async () => {
    const approval = {language: 'en', version: '2'};
    expect(await prepareDownload(PACK, OLD, needs(), approval)).toEqual({kind: 'go'});
    expect(await prepareDownload(PACK, OLD, needs({metered: true}), approval)).toEqual({
      kind: 'ask',
      question: {pack: PACK, bytes: 65, replaces: '1', metered: true},
    });
  });

  it('names every missing requirement before it asks', async () => {
    expect(await prepareDownload(PACK, EMPTY, needs({online: false, shared: false, free: null}))).toEqual({
      kind: 'needs',
      missing: ['network', 'shared-folder', 'free-space'],
    });
    expect(await prepareDownload(PACK, EMPTY, needs({free: PACK.size}))).toEqual({kind: 'needs', missing: ['free-space']});
    expect(await missingForUse(needs({online: false}))).toEqual([]);
    expect(await missingForUse(needs({shared: false}))).toEqual(['shared-folder']);
  });

  it('does nothing for the version already installed', async () => {
    const installed: InstalledCatalog = {packs: [{...PACK, file: 'en-2.pack'}]};
    expect(await prepareDownload(PACK, installed, needs({online: false}))).toEqual({kind: 'current'});
  });

  it('keeps a failed download a failure', async () => {
    const host = fakeHost({});
    const end = await downloadPack(PACK, {host, needs: needs(), installed: EMPTY, ask: async () => true});
    expect(end).toMatchObject({ok: false, code: 'HOST'});
  });
});
