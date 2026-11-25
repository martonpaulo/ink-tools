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
} from '@ink-tools/picture-search';
import {FIRST_BUTTON_ID, MODES, modeAdapters} from '../src/modes';

/** A white page; each tile below changes what it needs. */
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
/** A photo cut out on white paper: it measures as clean clip art (#169). */
const cutOut: Measures = {
  ...outline,
  border: 0.95,
  white: 0.5,
  mid: 0.3,
  dark: 0.1,
  ink: 0.2,
  objectShare: 0.5,
};

/**
 * Two Commons tiles of the beta 11 round's «banana» Illustrations page (#169), as
 * `ThumbMeasures.java` measures their 330 px thumbnails, and two Openclipart drawings of «banana»
 * and «pizza»: the photo cut out on white measures as an outline, the 3D render as plain clip art.
 */
const recorded: Record<string, Measures> = {
  'Banana on whitebackground': {
    ...paper,
    width: 330,
    height: 409,
    mean: 233.1,
    dark: 0.005,
    white: 0.724,
    mid: 0.245,
    border: 0.992,
    ink: 0.216,
    bands: 2,
    lineAspect: 1.704,
    thickness: 5.365,
    edge: 0.063,
    edgeBox: 0.697,
    colours: 324,
    shading: 0.766,
    objectShare: 0.287,
    fragments: 0.026,
    darkest: 105,
  },
  'Banana icon': {
    ...paper,
    width: 330,
    height: 191,
    mean: 226.2,
    dark: 0.002,
    white: 0.571,
    mid: 0.408,
    border: 0.814,
    ink: 0.345,
    bands: 1,
    lineAspect: 1.759,
    thickness: 10.991,
    edge: 0.051,
    edgeBox: 0.955,
    colours: 195,
    shading: 0.495,
    objectShare: 0.432,
    fragments: 0,
    darkest: 126,
  },
  'Single line art Banana': {
    ...paper,
    width: 355,
    height: 251,
    mean: 249.3,
    dark: 0.008,
    white: 0.954,
    mid: 0.042,
    border: 0.914,
    ink: 0.04,
    bands: 1,
    lineAspect: 1.422,
    thickness: 1.987,
    edge: 0.065,
    edgeBox: 0.958,
    colours: 12,
    shading: 0.11,
    objectShare: 0.048,
    fragments: 0.003,
    darkest: 73,
  },
  Pizza: {
    ...paper,
    width: 400,
    height: 283,
    mean: 230.6,
    dark: 0.021,
    white: 0.735,
    mid: 0.249,
    border: 0.88,
    ink: 0.23,
    bands: 1,
    lineAspect: 1.415,
    thickness: 2.907,
    edge: 0.152,
    edgeBox: 0.725,
    colours: 345,
    shading: 0.333,
    objectShare: 0.385,
    fragments: 0.126,
    darkest: 76,
  },
};

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

test('each mode has its own button id, from Lookup\'s first one', () => {
  const ids = MODES.map(mode => mode.buttonId);
  expect(new Set(ids).size).toBe(MODES.length);
  ids.forEach(id => {
    expect(id).toBeGreaterThanOrEqual(FIRST_BUTTON_ID);
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

  test('a canonical cut-out photo goes under Photos, never Illustrations: «banana» (#169)', () => {
    expect(pixelKind(cutOut)).toBe('clean');
    const wikidata = (id: string, mime: string): SearchResult => ({
      ...result(id),
      canonical: true,
      mime,
    });
    const tiles = [
      wikidata('photo', 'image/jpeg'),
      wikidata('logo', 'image/svg+xml'),
      wikidata('engraving', 'image/jpeg'),
      result('clipart'),
    ];
    const kinds = new Map<string, Measures>([
      ['photo', cutOut],
      ['logo', cutOut],
      ['engraving', outline],
      ['clipart', cutOut],
    ]);
    expect(keepMode(tiles, kinds, 'illustration').map(r => r.id)).toEqual([
      'logo',
      'engraving',
      'clipart',
    ]);
    expect(keepMode(tiles, kinds, 'photo').map(r => r.id)).toEqual(['photo']);
  });

  test('a photo cut out on white or a shaded render goes under Photos, never Illustrations: «banana» (#169)', () => {
    const titles = Object.keys(recorded);
    const tiles = titles.map(result);
    const measured = new Map(titles.map(title => [title, recorded[title]]));
    expect(pixelKind(recorded['Banana on whitebackground'])).toBe('outline');
    expect(pixelKind(recorded['Banana icon'])).toBe('plain');
    expect(keepMode(tiles, measured, 'illustration').map(r => r.id)).toEqual([
      'Single line art Banana',
      'Pizza',
    ]);
    expect(keepMode(tiles, measured, 'photo').map(r => r.id)).toEqual([
      'Banana on whitebackground',
      'Banana icon',
    ]);
  });

  test('a module that does not measure shading keeps the kind split', () => {
    const older: Measures = {...recorded['Banana icon'], shading: undefined};
    const tiles = [result('render')];
    const measured = new Map([['render', older]]);
    expect(keepMode(tiles, measured, 'illustration').map(r => r.id)).toEqual([
      'render',
    ]);
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
