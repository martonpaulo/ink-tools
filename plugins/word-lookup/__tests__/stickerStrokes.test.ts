/**
 * «Insert Sticker» turns the found drawing into pen strokes (#35, owner D62 A): the SVG path to
 * strokes, and the traced outline of a bitmap's ink.
 */
import {
  fitPolylines,
  maskFromRows,
  MAX_STICKER_POINTS,
  parseTransform,
  pathPolylines,
  simplify,
  strokeBudget,
  svgPolylines,
  traceMask,
  vectorUrl,
} from '@ink-tools/picture-search/insert';
import type {SearchResult} from '@ink-tools/picture-search/types';

describe('the vector path: SVG to strokes', () => {
  it('reads absolute and relative lines, H, V and Z as one closed stroke', () => {
    expect(pathPolylines('M0 0 L10 0 v10 H0 z')).toEqual([
      [
        {x: 0, y: 0},
        {x: 10, y: 0},
        {x: 10, y: 10},
        {x: 0, y: 10},
        {x: 0, y: 0},
      ],
    ]);
  });

  it('cuts a cubic curve into points that end on its end point', () => {
    const [line] = pathPolylines('M0,0 C0,10 10,10 10,0');
    expect(line.length).toBeGreaterThan(4);
    expect(line[line.length - 1]).toEqual({x: 10, y: 0});
    expect(Math.max(...line.map(p => p.y))).toBeCloseTo(7.5, 1);
  });

  it('keeps each subpath as its own stroke', () => {
    expect(pathPolylines('M0 0 L5 5 M10 10 l5 5')).toHaveLength(2);
  });

  it('applies group and element transforms and skips <defs>', () => {
    const svg = `<svg viewBox="0 0 100 100">
      <defs><rect x="0" y="0" width="99" height="99"/></defs>
      <g transform="translate(10 20)">
        <rect transform="scale(2)" x="1" y="1" width="4" height="4"/>
      </g>
      <circle cx="50" cy="50" r="5"/>
    </svg>`;
    const lines = svgPolylines(svg);
    expect(lines).toHaveLength(2);
    expect(lines[0][0]).toEqual({x: 12, y: 22});
    expect(lines[0][2]).toEqual({x: 20, y: 30});
    expect(lines[1][0]).toEqual({x: 55, y: 50});
  });

  it('reads matrix() and polygon points', () => {
    expect(parseTransform('matrix(1 0 0 1 3 4)')).toEqual([1, 0, 0, 1, 3, 4]);
    const [triangle] = svgPolylines('<svg><polygon points="0,0 4,0 0,4"/></svg>');
    expect(triangle).toHaveLength(4);
    expect(triangle[3]).toEqual(triangle[0]);
  });

  it('fits the drawing to the sticker width at (0, 0), keeping proportions', () => {
    const fitted = fitPolylines([[{x: 100, y: 50}, {x: 300, y: 150}]], 200, 400);
    expect(fitted).toEqual([[{x: 0, y: 0}, {x: 200, y: 100}]]);
    expect(fitPolylines([], 200, 400)).toEqual([]);
  });

  it('only a Commons SVG original is a vector source', () => {
    const base: SearchResult = {
      id: 'commons:1',
      source: 'commons',
      title: 'Apple',
      thumbUrl: 'https://upload.wikimedia.org/thumb/a.svg/330px-a.svg.png',
      license: 'CC0',
      attribution: 'x',
    };
    const svg = {
      ...base,
      mime: 'image/svg+xml',
      original: {url: 'https://upload.wikimedia.org/a.svg', width: 512},
    };
    expect(vectorUrl(svg)).toBe('https://upload.wikimedia.org/a.svg');
    expect(vectorUrl({...svg, mime: 'image/png'})).toBeNull();
    expect(vectorUrl(base)).toBeNull();
  });
});

/** A mask from rows of '#' (ink) and '.' (paper). */
function mask(...rows: string[]) {
  return maskFromRows(
    rows[0].length,
    rows.length,
    rows.join('').replace(/#/g, '1').replace(/\./g, '0'),
  );
}

describe('the trace path: a bitmap outline to strokes', () => {
  it('traces a filled square as one closed loop round its pixels', () => {
    const [loop, ...rest] = traceMask(mask('....', '.##.', '.##.', '....'));
    expect(rest).toEqual([]);
    expect(loop[0]).toEqual(loop[loop.length - 1]);
    expect(loop).toHaveLength(9);
    const corners = simplify(loop, 0.1);
    expect(corners.map(p => `${p.x},${p.y}`).sort()).toEqual(['1,1', '1,1', '1,3', '3,1', '3,3']);
  });

  it('traces a ring as its outer outline and its hole', () => {
    const loops = traceMask(mask('#####', '#...#', '#...#', '#...#', '#####'));
    expect(loops).toHaveLength(2);
  });

  it('drops a single dark pixel as noise', () => {
    expect(traceMask(mask('...', '.#.', '...'))).toEqual([]);
  });

  it('refuses a mask whose size does not match its pixels', () => {
    expect(() => maskFromRows(3, 3, '0101')).toThrow(/4 pixels for 3 x 3/);
  });
});

describe('the point budget', () => {
  it('simplifies a dense drawing until it fits, rounding to whole pixels', () => {
    const wiggle = Array.from({length: 2000}, (_, i) => ({x: i / 10, y: Math.sin(i / 50) * 40 + 50}));
    const kept = strokeBudget([wiggle]);
    const points = kept.reduce((n, line) => n + line.length, 0);
    expect(points).toBeLessThanOrEqual(MAX_STICKER_POINTS);
    expect(points).toBeGreaterThan(2);
    expect(kept[0].every(p => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
  });

  it('keeps the longest strokes when there are too many', () => {
    const lines = Array.from({length: 5}, (_, i) => [{x: 0, y: i * 10}, {x: i + 1, y: i * 10}]);
    const kept = strokeBudget(lines, 600, 2);
    expect(kept.map(line => line[1].x)).toEqual([5, 4]);
  });
});
