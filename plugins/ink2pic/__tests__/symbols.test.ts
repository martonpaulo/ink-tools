/**
 * OpenMoji pictures kept for offline use (#91), through the PluginHost simulator (#78): a symbol
 * shown once is saved in the plugin's private symbols folder, outside Supernote file sync (#23),
 * and shows and inserts with no network; with none saved, no symbol shows offline; «Download
 * symbols» resumes after it was cut off; symbols left in MyStyle/Ink2Pic/symbols are read, never
 * written or deleted.
 */
import React from 'react';
import {Image, NativeModules} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import * as sdk from 'sn-plugin-lib';
import {runSearch} from '../src/flow/search';
import {insertPicture} from '../src/flow/insertPicture';
import {
  openmojiPictureUrl,
  SearchResult,
  symbolHexes,
} from '@ink-tools/picture-search';
import * as openmoji from '@ink-tools/picture-search/adapters/openmoji';
import {resetThumbsForTests, thumbUri} from '../src/search/thumbs';
import {
  DOWNLOAD_PARALLEL,
  downloadAllSymbols,
  missingMegabytes,
  resetSymbolsForTests,
  savedSymbolPath,
  symbolFile,
  STOP_AFTER_FAILURES,
  symbolsStatus,
} from '../src/symbols/store';
import {ResultsGrid} from '../src/ui/ResultsGrid';
import {USER_AGENT} from '../src/config';
import {
  setAfterCall,
  closeLogFileForTests,
  flushLogFile,
  openLogFile,
  logsDir,
  oldSymbolsDir,
  symbolsDir,
} from '../src/profile';
import {createHost, PLUGIN_DIR, PluginHost} from './host/pluginHost';

const {PluginManager} = sdk as unknown as Record<
  string,
  Record<string, (...args: any[]) => any>
>;
const PICTURES = 'raw.githubusercontent.com';
/** The session log bytes a whole «Download symbols» may write (#102). */
const LOG_BYTES_LIMIT = 1000 * 1000;
const WORD = 'happy';
const OPTIONS = {
  width: 640,
  placement: 'below' as const,
  contour: false,
};

function started(): PluginHost {
  const host = createHost().install(
    sdk as unknown as Record<string, Record<string, unknown>>,
    NativeModules,
  );
  PluginManager.init();
  host.grantDeclared();
  host.press(1);
  return host;
}

const pictureRequests = (host: PluginHost) =>
  host.requests.filter(url => url.includes(PICTURES));

async function symbolResults() {
  const run = await runSearch(WORD, undefined, undefined, {exact: true});
  return (run.outcome?.results ?? []).filter(r => r.source === 'openmoji');
}

/**
 * Lets «Download symbols» fetch only the first `count` symbols, plus `keep`, and returns that
 * list: the whole 1,447 cost about 2 s a test alone and 17 s under parallel gates (#108). Only the
 * session log test downloads them all, since it measures the bytes of the whole run.
 */
function fewSymbols(count: number, keep: string[] = []): string[] {
  const few = [...new Set([...keep, ...symbolHexes().slice(0, count)])];
  jest.spyOn(openmoji, 'symbolHexes').mockReturnValue(few);
  return few;
}

/** Files written under MyStyle/, which Supernote file sync reads, except the plugin's own. */
const inSyncedFolder = (host: PluginHost) =>
  [...host.files.keys()].filter(file => file.startsWith(`${oldSymbolsDir()}/`));

/** A whole symbol PNG placed by hand, as the owner moved them with ADB (#23). */
function placed(host: PluginHost, dir: string, hex: string): string {
  const path = `${dir}/${hex}.png`;
  host.files.set(path, {
    image: {width: 618, height: 618},
    bytes: 10400,
    order: 0,
  });
  for (let at = dir; at.length > 1; at = at.slice(0, at.lastIndexOf('/'))) {
    host.folders.add(at);
  }
  return path;
}

/** A symbol's file in the private symbols folder (#23). */
const ownPath = (hex: string) => `${symbolsDir(PLUGIN_DIR)}/${hex}.png`;

/** Removes the symbols earlier tests saved, as a tablet that never saved one. */
function forgetSymbols(host: PluginHost): void {
  for (const file of [...host.files.keys()]) {
    if (file.startsWith(`${symbolsDir(PLUGIN_DIR)}/`)) {
      host.files.delete(file);
    }
  }
}

/** Whether any call asked the module to delete a file (#23: the owner's files stay). */
const deletes = (host: PluginHost) =>
  host.calls.filter(c => c.name === 'deleteFile');

beforeEach(() => resetSymbolsForTests());
afterEach(() => jest.restoreAllMocks());

describe('offline symbols (#91)', () => {
  it('shows and inserts a symbol seen once, with no network, from the symbols folder', async () => {
    const host = started();
    const [first, ...others] = await symbolResults();
    expect(first).toBeDefined();
    expect(first.offlinePicture).toBeUndefined();
    const uri = await thumbUri(first, '/unused');
    const path = ownPath(first.id.slice('openmoji:'.length));
    expect(uri).toBe(`file://${path}`);
    expect(path).toMatch(/^\/data\/user\/0\/.+\/symbols\/[0-9A-F-]+\.png$/);
    expect(inSyncedFolder(host)).toEqual([]);
    expect(host.files.has(path)).toBe(true);

    resetSymbolsForTests(); // a new session lists the folder again
    host.online = false;
    const before = pictureRequests(host).length;
    const offline = await symbolResults();
    expect(offline.map(r => r.id)).toEqual([first.id]);
    expect(offline[0].offlinePicture).toBe(true);
    expect(others.length).toBeGreaterThan(0);
    expect(await thumbUri(offline[0], '/unused')).toBe(`file://${path}`);
    const inserted = await insertPicture(
      offline[0],
      WORD,
      null,
      false,
      OPTIONS,
    );
    expect(inserted.ok).toBe(true);
    expect(pictureRequests(host).length).toBe(before);
  });

  it('shows a saved symbol offline in a grid with no thumbnail store (#99)', async () => {
    const host = started();
    const [first] = await symbolResults();
    const file = `file://${ownPath(first.id.slice('openmoji:'.length))}`;
    expect(await thumbUri(first, '/unused')).toBe(file);

    resetSymbolsForTests(); // a new session lists the folder again
    resetThumbsForTests(); // and its plugin folder is not listed: no store
    host.online = false;
    const offline = await symbolResults();
    expect(offline.map(r => r.id)).toEqual([first.id]);
    expect(await thumbUri(offline[0], '/unused')).toBe(file);
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        React.createElement(ResultsGrid, {
          results: offline,
          searching: false,
          onPick: () => {},
          thumbDir: null,
        }),
      );
    });
    const uris = tree.root
      .findAllByType(Image)
      .map(image => image.props.source.uri);
    expect(uris).toEqual([file]);
    act(() => tree.unmount());
  });

  it('saves a symbol inserted from the search, for the next time', async () => {
    const host = started();
    const hex = '2744'; // not inserted by an earlier test, whose library the module keeps
    const symbol: SearchResult = {
      id: `openmoji:${hex}`,
      source: 'openmoji',
      title: 'snowflake',
      thumbUrl: openmojiPictureUrl(hex),
      license: 'CC BY-SA 4.0',
      attribution: 'OpenMoji',
      mime: 'image/png',
    };
    const inserted = await insertPicture(symbol, WORD, null, false, OPTIONS);
    expect(inserted.ok).toBe(true);
    expect(host.files.has(ownPath(hex))).toBe(true);
  });

  it('never counts a symbol whose download was cut off without an error', async () => {
    const host = started();
    const hex = '1F327'; // cloud with rain
    const symbol: SearchResult = {
      id: `openmoji:${hex}`,
      source: 'openmoji',
      title: 'cloud with rain',
      thumbUrl: openmojiPictureUrl(hex),
      license: 'CC BY-SA 4.0',
      attribution: 'OpenMoji',
      mime: 'image/png',
    };
    host.cutOff.set(PICTURES, 'silent');
    // The grid falls back to the web picture, and the half file is not saved.
    expect(await thumbUri(symbol, '/unused')).toBe(symbol.thumbUrl);
    expect(host.files.get(ownPath(hex))?.truncated).toBe(true);
    expect(savedSymbolPath(symbol)).toBeNull();
    resetSymbolsForTests(); // a new session lists the folder again
    expect(await symbolFile(symbol)).toBeNull();
    // The next save writes over it in place, with no delete.
    host.cutOff.delete(PICTURES);
    expect(await thumbUri(symbol, '/unused')).toBe(`file://${ownPath(hex)}`);
    expect(host.files.get(ownPath(hex))?.truncated).toBeUndefined();
  });

  it('states the size, downloads politely, stops when cut off and resumes', async () => {
    const host = started();
    const status = await symbolsStatus();
    expect(status).toEqual({total: symbolHexes().length, saved: 0});
    // About 15 MB measured for the 1,447 PNGs (#91).
    expect(missingMegabytes(status)).toBe(15);

    const total = fewSymbols(40).length;
    const cut = await downloadAllSymbols(progress => {
      if (progress.saved === 10) {
        // The stream ends early: half of each file is written in place, then the call fails.
        host.cutOff.set(PICTURES, 'error');
      }
    });
    expect(cut.complete).toBe(false);
    expect(cut.saved).toBeGreaterThanOrEqual(10);
    expect(cut.saved).toBeLessThan(total);
    // It stops after a few failures in a row: no request for each of the 1,447 (#104).
    expect(cut.stopped).toBe(true);
    expect(pictureRequests(host).length).toBeLessThanOrEqual(
      cut.saved + STOP_AFTER_FAILURES + DOWNLOAD_PARALLEL,
    );

    // Each cut-off file stays on the device, but no new session counts it as saved.
    const partial = [...host.files.entries()].filter(([, e]) => e.truncated);
    expect(partial.length).toBeGreaterThan(0);
    host.cutOff.delete(PICTURES);
    resetSymbolsForTests();
    expect(await symbolsStatus()).toEqual({total, saved: cut.saved});
    const before = pictureRequests(host).length;
    const resumed = await downloadAllSymbols(() => {});
    expect(resumed).toEqual({
      total,
      saved: total,
      complete: true,
      failed: 0,
      stopped: false,
    });
    // Only the missing ones are asked for, each once, with the plugin's User-Agent.
    expect(pictureRequests(host).length - before).toBe(total - cut.saved);
    const calls = host.calls.filter(c => c.name === 'downloadThumbToFile');
    expect(
      calls.every(
        c => (c.args[2] as Record<string, string>)['User-Agent'] === USER_AGENT,
      ),
    ).toBe(true);
    expect(await symbolsStatus()).toEqual({total, saved: total});
  });

  it('skips a symbol that always fails and finishes the rest (#104)', async () => {
    const host = started();
    const total = fewSymbols(20).length;
    const [broken] = symbolHexes();
    host.failing.set(openmojiPictureUrl(broken), 404);
    const end = await downloadAllSymbols(() => {});
    expect(end).toEqual({
      total,
      saved: total - 1,
      complete: false,
      failed: 1,
      stopped: false,
    });
    expect(await symbolsStatus()).toEqual({total, saved: total - 1});
  });

  it('lists by name and size, and checks the PNG end only of the symbol inserted (#102)', async () => {
    const host = started();
    const [symbol] = await symbolResults();
    const hex = symbol.id.slice('openmoji:'.length);
    fewSymbols(5, [hex]);
    await downloadAllSymbols(() => {});
    // A file cut off midway, the way a grid download can leave one.
    host.files.set(ownPath(hex), {bytes: 100, order: 0, truncated: true});
    resetSymbolsForTests();
    const checks = () =>
      host.calls.filter(c => c.name === 'isCompletePng').length;
    const before = checks();
    await symbolResults();
    expect(host.calls.some(c => c.name === 'listSizes')).toBe(true);
    // The listing opened no file: a search checks none while the network is up.
    expect(checks()).toBe(before);
    expect(savedSymbolPath(symbol)).not.toBeNull();
    // The insert checks it, finds it cut off, and downloads the picture instead.
    expect(await symbolFile(symbol)).toBeNull();
    expect(checks()).toBe(before + 1);
    expect(savedSymbolPath(symbol)).toBeNull();
    // The grid saves it again, whole.
    expect(await thumbUri(symbol, '/unused')).toBe(`file://${ownPath(hex)}`);
    expect(host.files.get(ownPath(hex))?.truncated).toBeUndefined();
  });

  it('appends the session log during «Download symbols» (#102)', async () => {
    const host = started();
    const log = `${logsDir()}/session.log`;
    openLogFile(logsDir());
    setAfterCall(flushLogFile);
    try {
      await downloadAllSymbols(() => {});
      await flushLogFile();
    } finally {
      setAfterCall(() => {});
      closeLogFileForTests();
    }
    const writes = host.calls.filter(
      c =>
        (c.name === 'writeText' || c.name === 'appendText') &&
        c.args[0] === log,
    );
    const rewrites = writes.filter(c => c.name === 'writeText');
    const bytes = writes.reduce((sum, c) => sum + String(c.args[1]).length, 0);
    const file = host.files.get(log)?.text ?? '';
    // Two logged calls per symbol (its download and its PNG check), each flushed once.
    const total = symbolHexes().length;
    expect(writes.length).toBeLessThanOrEqual(2 * total + 3);
    // The first write, then one each time the file reaches LOG_FILE_REWRITE_LINES.
    expect(rewrites.length).toBeLessThanOrEqual(3);
    // Each line is written about once, plus the rewrites: under 0.5 MB measured, where every flush
    // rewrote up to 2,000 lines before #102, 56 MB for the same run.
    expect(bytes).toBeLessThan(LOG_BYTES_LIMIT);
    expect(file).toMatch(/symbols: 1447 of 1447 saved, 0 failed\n$/);
  });

  it('lists the folder again after a failed listing, and downloads nothing meanwhile (#99)', async () => {
    const host = started();
    const [first] = await symbolResults();
    await thumbUri(first, '/unused'); // saved
    resetSymbolsForTests();
    const total = symbolHexes().length;
    jest
      .spyOn(NativeModules.Ink2PicFiles, 'listSizes')
      .mockRejectedValueOnce(new Error('EIO'));
    expect(await symbolsStatus()).toEqual({total, saved: 0, unreadable: true});
    const before = pictureRequests(host).length;
    // A failure that is not cached: this listing works, so nothing is downloaded again.
    jest
      .spyOn(NativeModules.Ink2PicFiles, 'listSizes')
      .mockRejectedValueOnce(new Error('EIO'));
    expect(await downloadAllSymbols(() => {})).toEqual({
      total,
      saved: 0,
      unreadable: true,
      complete: false,
      failed: 0,
      stopped: true,
    });
    expect(pictureRequests(host).length).toBe(before);
    expect(await symbolsStatus()).toEqual({total, saved: 1});
    expect(savedSymbolPath(first)).not.toBeNull();
  });

  it('writes «Download symbols» only to the private folder, none in shared storage (#23)', async () => {
    const host = started();
    const few = fewSymbols(5);
    const end = await downloadAllSymbols(() => {});
    expect(end.complete).toBe(true);
    for (const hex of few) {
      expect(host.files.has(`${symbolsDir(PLUGIN_DIR)}/${hex}.png`)).toBe(true);
    }
    expect(inSyncedFolder(host)).toEqual([]);
    expect(
      [...host.files.keys()].filter(
        file => file.startsWith('/storage/') && file.endsWith('.png'),
      ),
    ).toEqual([]);
    expect(deletes(host)).toEqual([]);
  });

  it('never reads the hidden .ink2pic-symbols folder, which PluginHost refuses (#23)', async () => {
    const host = started();
    fewSymbols(3);
    resetSymbolsForTests();
    forgetSymbols(host);
    placed(host, '/storage/emulated/0/.ink2pic-symbols', symbolHexes()[0]);
    // dev.18 listed it and showed «Saved symbols cannot be read now».
    expect(await symbolsStatus()).toEqual({total: 3, saved: 0});
  });

  it('reads a symbol left in the old synced folder, never writes or deletes there (#23)', async () => {
    const host = started();
    // The last symbol: the module's library still holds the first from an earlier test.
    const first = (await symbolResults()).slice(-1)[0];
    const hex = first.id.slice('openmoji:'.length);
    resetSymbolsForTests();
    forgetSymbols(host);
    const old = placed(host, oldSymbolsDir(), hex);
    const total = fewSymbols(3, [hex]).length;

    // Offline, it still shows and inserts from the old folder.
    host.online = false;
    const offline = await symbolResults();
    expect(offline.map(r => r.id)).toEqual([first.id]);
    expect(await thumbUri(offline[0], '/unused')).toBe(`file://${old}`);
    const inserted = await insertPicture(
      offline[0],
      WORD,
      null,
      false,
      OPTIONS,
    );
    expect(inserted.ok).toBe(true);

    // Settings counts it, and names the files left in the old folder.
    expect(await symbolsStatus()).toEqual({total, saved: 1, oldFiles: 1});

    // «Download symbols» fetches only the others, into the private folder.
    host.online = true;
    const before = pictureRequests(host).length;
    const end = await downloadAllSymbols(() => {});
    expect(end).toEqual({
      total,
      saved: total,
      oldFiles: 1,
      complete: true,
      failed: 0,
      stopped: false,
    });
    expect(pictureRequests(host).length - before).toBe(total - 1);
    expect(inSyncedFolder(host)).toEqual([old]);
    expect(host.files.get(old)?.order).toBe(0);
    expect(deletes(host)).toEqual([]);
  });

  // Last: its failed searches open the sources' breaker for the rest of the file.
  it('shows no symbol offline when none is saved', async () => {
    const host = started();
    host.online = false;
    expect(await symbolResults()).toEqual([]);
  });
});
