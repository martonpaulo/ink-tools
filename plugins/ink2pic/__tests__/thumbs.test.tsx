/**
 * Ink2Pic's results grid over the stored thumbnails (#16, #46). The thumbnail files themselves run
 * in the packages gate, packages/picture-search/__tests__/thumbs.test.ts (#142, D63 A).
 */
import React from 'react';
import {Image, NativeModules} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {PluginManager} from 'sn-plugin-lib';
import {resetSessionForTests, closeLogFileForTests} from '../src/profile';
import {prepareThumbs, resetThumbsForTests} from '../src/search/thumbs';
import type {SearchResult} from '@ink-tools/picture-search/types';
import {ResultsGrid} from '../src/ui/ResultsGrid';

const DIR = '/data/plugin';
const THUMBS = `${DIR}/thumbs`;

function result(n: number): SearchResult {
  return {
    id: `openclipart:${n}`,
    source: 'openclipart',
    title: `Picture ${n}`,
    thumbUrl: `https://openclipart.org/image/400px/${n}`,
    license: 'CC0 1.0',
    attribution: 'Openclipart',
  };
}

const native = {
  downloadToFile: jest.fn(),
  downloadThumbToFile: jest.fn(),
  deleteFile: jest.fn(),
  writeText: jest.fn(),
  readText: jest.fn(),
  listDir: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  NativeModules.Ink2PicFiles = native;
  resetSessionForTests();
  resetThumbsForTests();
  closeLogFileForTests();
  (PluginManager.getPluginDirPath as jest.Mock).mockResolvedValue(DIR);
  native.readText.mockResolvedValue(null);
  native.writeText.mockResolvedValue(null);
  native.downloadToFile.mockResolvedValue(42000);
  native.downloadThumbToFile.mockResolvedValue(42000);
  native.deleteFile.mockResolvedValue(true);
  native.listDir.mockResolvedValue([]);
});

const fileUri = (n: number) => `file://${THUMBS}/openclipart-${n}`;
const downloaded = () =>
  native.downloadThumbToFile.mock.calls.map(call => call[1]);

describe('the grid with stored thumbnails (#16, #46)', () => {
  function grid(
    results: SearchResult[],
    contourThumbs?: ReadonlyMap<string, string>,
  ): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ResultsGrid
          results={results}
          searching={false}
          onPick={jest.fn()}
          thumbDir={DIR}
          contourThumbs={contourThumbs}
        />,
      );
    });
    return tree;
  }

  it('reads stored files at once and downloads the rest before their tiles render', async () => {
    native.listDir.mockResolvedValue(['openclipart-1']);
    await prepareThumbs();
    let finish!: (bytes: number) => void;
    native.downloadThumbToFile.mockReturnValue(
      new Promise(resolve => (finish = resolve)),
    );
    const tree = grid([result(1), result(2)]);
    const uris = () =>
      tree.root.findAllByType(Image).map(img => img.props.source.uri);
    expect(uris()).toEqual([fileUri(1)]);
    await act(async () => {});
    expect(uris()).toEqual([fileUri(1)]);
    expect(downloaded()).toEqual([`${THUMBS}/openclipart-2`]);
    await act(async () => finish(42000));
    expect(uris()).toEqual([fileUri(1), fileUri(2)]);
    act(() => tree.unmount());
  });

  it('retries a file that cannot be shown once from the web, then marks it failed (#46)', async () => {
    native.listDir.mockResolvedValue(['openclipart-1']);
    await prepareThumbs();
    const tree = grid([result(1)]);
    const image = () => tree.root.findAllByType(Image)[0];
    expect(image().props.source.uri).toBe(fileUri(1));
    // Fresco cannot read the extension-less file, or it was not complete yet.
    act(() => image().props.onError());
    expect(image().props.source.uri).toBe(result(1).thumbUrl);
    act(() => image().props.onError());
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('shows the contour drawing of a converted picture (#66)', async () => {
    native.listDir.mockResolvedValue(['openclipart-1', 'openclipart-2']);
    await prepareThumbs();
    const contour = `file://${THUMBS}/openclipart-1.contour.png`;
    const tree = grid(
      [result(1), result(2)],
      new Map([[result(1).id, contour]]),
    );
    expect(
      tree.root.findAllByType(Image).map(img => img.props.source.uri),
    ).toEqual([contour, fileUri(2)]);
    act(() => tree.unmount());
  });

  it('marks a library file failed at once: it has no web copy', async () => {
    await prepareThumbs();
    const local = {...result(1), thumbUrl: 'file:///lib/a.png'};
    const tree = grid([local]);
    act(() => tree.root.findAllByType(Image)[0].props.onError());
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('costs one request per thumbnail on a new page (audit: two)', async () => {
    await prepareThumbs();
    const results = Array.from({length: 6}, (_, n) => result(n + 1));
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = grid(results);
    });
    const webUris = new Set<string>();
    // Every render the page goes through until it shows, so a tile that changes its URI counts.
    for (let round = 0; round < 3; round++) {
      const images = tree.root.findAllByType(Image);
      images
        .map(img => img.props.source.uri as string)
        .filter(uri => uri.startsWith('https://'))
        .forEach(uri => webUris.add(uri));
      await act(async () => images.forEach(img => img.props.onLoad()));
    }
    const requests =
      webUris.size +
      native.downloadThumbToFile.mock.calls.length +
      native.downloadToFile.mock.calls.length;
    expect(requests).toBe(results.length);
    expect(
      tree.root.findByProps({testID: 'grid'}).props.style,
    ).not.toContainEqual(expect.objectContaining({opacity: 0}));
    act(() => tree.unmount());
  });
});
