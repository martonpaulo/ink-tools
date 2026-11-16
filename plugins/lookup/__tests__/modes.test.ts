/**
 * Lookup's two picture modes (#111): their own button ids, their own sources, and a measured order
 * split by mode, never one blended list.
 */
import {
  DEFAULT_ADAPTERS,
  fitsMode,
  keepMode,
  MEASURED_RESULTS,
  Measures,
  pixelKind,
  SearchResult,
} from '@supernote-tools/picture-search';
import * as ink2pic from '../../ink2pic/src/buttons';
import {FIRST_BUTTON_ID, MODES, modeAdapters} from '../src/modes';

/** A white page; each tile below changes what it needs (as Ink2Pic's measures tests do). */
const paper: Measures = {
  width: 400,
  height: 400,
  mean: 255,
  dark: 0,
  white: 1,
  mid: 0,
  border: 1,
  borderMedian: 255,
  ink: 0,
  inkLeft: 0,
  inkTop: 0,
  inkWidth: 0,
  inkHeight: 0,
  bands: 0,
  lineAspect: 0,
  thickness: 0,
  edge: 0,
  edgeBox: 0,
  colours: 1,
  objectShare: 0,
  fragments: 0,
  darkest: 255,
  faintLines: false,
  ms: 1,
};
const outline: Measures = {
  ...paper,
  white: 0.8,
  dark: 0.05,
  ink: 0.08,
  objectShare: 0.2,
  bands: 3,
  lineAspect: 1,
  thickness: 2,
};
const photo: Measures = {
  ...paper,
  mean: 140,
  border: 0.1,
  mid: 0.6,
  objectShare: 0.9,
};
const dark: Measures = {...paper, mean: 60, border: 0.1, objectShare: 0.9};
const blank: Measures = {...paper, objectShare: 0.001};

function result(id: string): SearchResult {
  return {
    id,
    source: 'commons',
    title: id,
    thumbUrl: `https://example.org/${id}.png`,
    license: 'CC0',
    attribution: '',
  };
}

test('the tiles measure as the kinds the split reads', () => {
  expect(pixelKind(outline)).toBe('outline');
  expect(pixelKind(photo)).toBe('photo');
  expect(pixelKind(dark)).toBe('dark');
  expect(pixelKind(blank)).toBe('blank');
});

test('each mode has its own button id, never one of Ink2Pic', () => {
  const ink2picIds = Object.values(ink2pic).filter(
    value => typeof value === 'number' && value >= 100,
  );
  const ids = MODES.map(mode => mode.buttonId);
  expect(new Set(ids).size).toBe(MODES.length);
  ids.forEach(id => {
    expect(id).toBeGreaterThanOrEqual(FIRST_BUTTON_ID);
    expect(ink2picIds).not.toContain(id);
  });
  expect(MODES.map(mode => mode.name)).toEqual([
    'Insert Sticker',
    'Insert Image',
  ]);
});

test('the photo mode leaves out clip art and symbols; illustration keeps every source', () => {
  const [illustration, photoMode] = MODES;
  const names = (mode: typeof illustration) =>
    modeAdapters(mode, DEFAULT_ADAPTERS).map(adapter => adapter.name);
  expect(names(illustration)).toEqual(DEFAULT_ADAPTERS.map(a => a.name));
  expect(names(photoMode)).toEqual(['commons', 'wikidata']);
  expect(illustration.photos).toBe(false);
  expect(photoMode.photos).toBe(true);
});

test('a blank tile fits no mode', () => {
  expect(fitsMode('blank', 'photo')).toBe(false);
  expect(fitsMode('blank', 'illustration')).toBe(false);
});

describe('keepMode', () => {
  const ordered = ['a', 'b', 'c', 'd', 'e', 'f'].map(result);
  const measures = new Map<string, Measures>([
    ['a', outline],
    ['b', photo],
    ['c', blank],
    ['d', dark],
    ['e', outline],
    // 'f' is not measured.
  ]);

  test('the photo list keeps only photos and dark paintings, in order', () => {
    expect(keepMode(ordered, measures, 'photo').map(r => r.id)).toEqual([
      'b',
      'd',
    ]);
  });

  test('the illustration list keeps no photo', () => {
    expect(keepMode(ordered, measures, 'illustration').map(r => r.id)).toEqual([
      'a',
      'e',
    ]);
  });

  test('a photo list with no photo is empty, never drawings', () => {
    const drawings = new Map<string, Measures>([
      ['a', outline],
      ['e', outline],
    ]);
    expect(keepMode(ordered, drawings, 'photo')).toEqual([]);
  });

  test('the two lists never share a tile across pages 1 and 2', () => {
    const many = Array.from({length: MEASURED_RESULTS}, (_, i) =>
      result(`r${i}`),
    );
    const mixed = new Map<string, Measures>(
      many.map((r, i) => [r.id, i % 2 === 0 ? photo : outline]),
    );
    const photos = keepMode(many, mixed, 'photo').map(r => r.id);
    const drawings = keepMode(many, mixed, 'illustration').map(r => r.id);
    expect(photos.filter(id => drawings.includes(id))).toEqual([]);
    expect(photos.length + drawings.length).toBe(MEASURED_RESULTS);
  });
});
