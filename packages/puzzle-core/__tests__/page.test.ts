import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { crc32, inflateSync } from 'zlib';
import {
  toBase64,
  NATIVE_GREYS,
  PageFitError,
  assertNativeGreys,
  createPage,
  createRaster,
  drawCage,
  drawCellText,
  drawDotLattice,
  drawEdgeSign,
  drawFutoshikiPage,
  drawFooter,
  drawHexLattice,
  drawIcon,
  drawOutsideClues,
  drawRegions,
  drawSquareLattice,
  drawText,
  drawTriangleLattice,
  encodePng,
  fillRect,
  fitCellMm,
  generateFutoshiki,
  generateNonogram,
  generateSudoku,
  generateWordSearch,
  layoutPage,
  puzzleCode,
  shadeCells,
  strokeLine,
  type Grid,
  type PageLayout,
  type PageSpec,
  type Raster,
} from '../src';
import { SAMPLE_PAGES } from '../testing/pages';

/**
 * Golden images of the page renderer (#379). Each render is compared pixel by pixel with its PNG
 * in `golden/`; `UPDATE_GOLDEN=1 npx jest page` writes them again after a deliberate change, and
 * the new images are looked at before they are committed.
 */
const GOLDEN = join(__dirname, 'golden');

/** Decodes the PNGs this renderer writes (8-bit greyscale, filters None and Up) with Node's zlib. */
function decodePng(bytes: Uint8Array): Raster {
  const view = Buffer.from(bytes);
  expect([...view.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let at = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (at < view.length) {
    const length = view.readUInt32BE(at);
    const type = view.toString('latin1', at + 4, at + 8);
    const body = view.subarray(at + 8, at + 8 + length);
    expect(view.readUInt32BE(at + 8 + length)).toBe(crc32(view.subarray(at + 4, at + 8 + length)));
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      expect([...body.subarray(8)]).toEqual([8, 0, 0, 0, 0]);
    } else if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)];
    for (let x = 0; x < width; x++) {
      const value = raw[y * (width + 1) + 1 + x];
      pixels[y * width + x] = filter === 2 && y > 0 ? (value + pixels[(y - 1) * width + x]) & 0xff : value;
    }
    expect(filter === 0 || filter === 2).toBe(true);
  }
  return { width, height, pixels };
}

function expectGolden(name: string, raster: Raster): void {
  assertNativeGreys(raster);
  const png = encodePng(raster);
  const path = join(GOLDEN, `${name}.png`);
  if (process.env.UPDATE_GOLDEN === '1') writeFileSync(path, png);
  expect(existsSync(path)).toBe(true);
  const golden = decodePng(readFileSync(path));
  expect([golden.width, golden.height]).toEqual([raster.width, raster.height]);
  let differing = 0;
  for (let i = 0; i < raster.pixels.length; i++) if (golden.pixels[i] !== raster.pixels[i]) differing++;
  expect(`${name}: ${differing} pixels differ`).toBe(`${name}: 0 pixels differ`);
}

const SWATCH = 720;

/** The same pixels with no changed-row flags, for a test that writes pixels directly. */
const unflagged = ({ width, height, pixels }: Raster): Raster => ({ width, height, pixels });
const square = (columns: number, rows: number, cell = 118): Grid => ({ lattice: 'square', x: 60, y: 60, cell, columns, rows });

/** A swatch with a square lattice already drawn, for the primitives drawn over one. */
function latticeSwatch(columns: number, rows: number): { r: Raster; grid: Grid } {
  const r = createRaster(SWATCH, SWATCH);
  const grid = square(columns, rows, 140);
  drawSquareLattice(r, grid);
  return { r, grid };
}

describe('the 16 native greys', () => {
  test('are 0x00, 0x11 ... 0xFF', () => {
    expect(NATIVE_GREYS).toHaveLength(16);
    expect(NATIVE_GREYS[1]).toBe(0x11);
    expect(NATIVE_GREYS[15]).toBe(0xff);
  });

  test('the check fails on a pixel that is not one of them, and so does the encoder', () => {
    const raster = unflagged(createRaster(8, 4));
    raster.pixels[2 * 8 + 5] = 0x10;
    expect(() => assertNativeGreys(raster)).toThrow('pixel (5, 2) is 0x10, not one of the 16 native greys');
    expect(() => encodePng(raster)).toThrow('not one of the 16 native greys');
  });

  test('a slanted line blends its edges into native greys only', () => {
    const raster = createRaster(200, 200);
    strokeLine(raster, 10, 20, 190, 150, 3, 'ink');
    assertNativeGreys(raster);
    const values = new Set(raster.pixels);
    expect(values.has(0x00)).toBe(true);
    expect([...values].some((v) => v !== 0x00 && v !== 0xff)).toBe(true);
  });
});

describe('the PNG', () => {
  test('decodes with zlib to the same pixels', () => {
    const raster = unflagged(createRaster(301, 97));
    for (let i = 0; i < raster.pixels.length; i++) raster.pixels[i] = NATIVE_GREYS[(i * 7 + (i >> 5)) % 16];
    fillRect(raster, 0, 40, 301, 30, 'paper');
    const back = decodePng(encodePng(raster));
    expect([back.width, back.height]).toEqual([301, 97]);
    expect(Buffer.from(back.pixels).equals(Buffer.from(raster.pixels))).toBe(true);
  });

  test('a page skips the rows its paint calls left equal, and packs to the same bytes', () => {
    // The encoder trusts the changed-row flags the paint calls keep (#379, device round 11): a
    // flag missed by a paint call would leave a row out, so each sample page must encode to the
    // same bytes as its pixels compared row by row.
    for (const [name, draw] of SAMPLE_PAGES) {
      const raster = draw();
      expect([name, Buffer.from(encodePng(raster)).equals(Buffer.from(encodePng(unflagged(raster))))]).toEqual([name, true]);
    }
  });

  test('a blank page packs small', () => {
    expect(encodePng(createRaster(1920, 2560)).length).toBeLessThan(40_000);
  });

  test('a rectangle off whole pixels is refused', () => {
    expect(() => fillRect(createRaster(10, 10), 1.5, 0, 2, 2, 'ink')).toThrow('whole pixels');
  });
});

describe('each primitive matches its golden image', () => {
  test('square lattice', () => {
    const r = createRaster(SWATCH, SWATCH);
    drawSquareLattice(r, square(5, 5));
    expectGolden('square-lattice', r);
  });

  test('dot lattice', () => {
    const r = createRaster(SWATCH, SWATCH);
    drawDotLattice(r, square(5, 5));
    expectGolden('dot-lattice', r);
  });

  test('hex lattice', () => {
    const r = createRaster(SWATCH, SWATCH);
    drawHexLattice(r, { lattice: 'hex', x: 60, y: 60, cell: 118, columns: 4, rows: 4 });
    expectGolden('hex-lattice', r);
  });

  test('triangle lattice', () => {
    const r = createRaster(SWATCH, SWATCH);
    drawTriangleLattice(r, { lattice: 'triangle', x: 60, y: 60, cell: 118, columns: 8, rows: 5 });
    expectGolden('triangle-lattice', r);
  });

  test('region borders and shading', () => {
    const r = createRaster(SWATCH, SWATCH);
    const grid = square(4, 4, 140);
    shadeCells(r, grid, [[0, 0], [1, 0], [0, 1], [3, 3]]);
    drawSquareLattice(r, grid);
    drawRegions(r, grid, (c, row) => Math.floor(c / 2) + 2 * Math.floor(row / 2));
    expectGolden('regions', r);
  });

  test('cages with sums', () => {
    const { r, grid } = latticeSwatch(4, 4);
    drawCage(r, grid, [[0, 0], [1, 0], [1, 1]], '17');
    drawCage(r, grid, [[3, 0], [3, 1], [2, 1], [2, 2], [3, 2]], '23');
    drawCage(r, grid, [[0, 3]], '5');
    expectGolden('cage', r);
  });

  test('outside clues on every side', () => {
    const r = createRaster(SWATCH, SWATCH);
    const grid: Grid = { lattice: 'square', x: 200, y: 200, cell: 83, columns: 5, rows: 5 };
    drawSquareLattice(r, grid);
    drawOutsideClues(r, grid, 'top', [['1', '2'], ['5'], [], ['1', '1', '1'], ['12']], 12);
    drawOutsideClues(r, grid, 'left', [['3'], ['1', '1'], ['5'], [], ['2', '10']], 12);
    drawOutsideClues(r, grid, 'bottom', [['4'], ['1'], ['2'], ['3'], ['2']], 12);
    drawOutsideClues(r, grid, 'right', [['2'], ['3'], ['1'], ['4'], ['2']], 12);
    expectGolden('outside-clues', r);
  });

  test('givens and corner clues in cells', () => {
    const { r, grid } = latticeSwatch(4, 4);
    drawCellText(r, grid, 0, 0, '7', 'given');
    drawCellText(r, grid, 1, 1, 'A', 'given');
    drawCellText(r, grid, 2, 0, '16', 'given');
    drawCellText(r, grid, 3, 2, '12', 'clue');
    drawCellText(r, grid, 0, 3, 'Ñ', 'given');
    drawCellText(r, grid, 1, 3, '3+', 'clue');
    expectGolden('cell-text', r);
  });

  test('icons', () => {
    const { r, grid } = latticeSwatch(4, 2);
    const icons = ['tree', 'pearl-white', 'pearl-black', 'cross', 'arrow-up', 'arrow-right', 'arrow-down', 'arrow-left'] as const;
    icons.forEach((icon, i) => drawIcon(r, grid, i % 4, Math.floor(i / 4), icon));
    expectGolden('icons', r);
  });

  test('edge signs', () => {
    const { r, grid } = latticeSwatch(4, 4);
    drawCellText(r, grid, 0, 0, '1', 'given');
    drawEdgeSign(r, grid, 0, 0, 'right', 'first');
    drawEdgeSign(r, grid, 1, 0, 'right', 'second');
    drawEdgeSign(r, grid, 0, 0, 'down', 'first');
    drawEdgeSign(r, grid, 2, 1, 'down', 'second');
    drawEdgeSign(r, grid, 2, 3, 'right', 'first');
    expect(() => drawEdgeSign(r, grid, 3, 0, 'right', 'first')).toThrow('cell 3,0 has no neighbour to the right');
    expect(() => drawEdgeSign(r, grid, 0, 3, 'down', 'first')).toThrow('cell 0,3 has no neighbour below');
    expectGolden('edge-signs', r);
  });
});

describe('each preset and layout matches its golden page', () => {
  test.each(SAMPLE_PAGES.map(([name, draw]) => [name, draw] as const))('%s', (name, draw) => {
    expectGolden(name, draw());
  });
});

describe('the layout', () => {
  const spec: PageSpec = { orientation: 'portrait', hand: 'right', cellMm: 15, lattice: 'square', columns: 9, rows: 9 };

  test('a futoshiki page', () => {
    expectGolden('page-futoshiki-7mm-portrait-right', drawFutoshikiPage(generateFutoshiki('P1', 7, 'hard'), { orientation: 'portrait', hand: 'right', cellMm: 7 }).raster);
    expectGolden('page-futoshiki-15mm-landscape-left', drawFutoshikiPage(generateFutoshiki('P1', 5, 'medium'), { orientation: 'landscape', hand: 'left' }).raster);
  });

  test('the presets are 83, 118 and 177 px cells', () => {
    expect([7, 10, 15].map((cellMm) => layoutPage({ ...spec, cellMm: cellMm as 7 | 10 | 15 }).grid.cell)).toEqual([83, 118, 177]);
  });

  test('a grid that does not fit throws, naming how much it is over', () => {
    expect(() => layoutPage({ ...spec, columns: 25, rows: 25 })).toThrow(PageFitError);
    expect(() => layoutPage({ ...spec, columns: 25, rows: 25 })).toThrow(/2693 px too wide, 2195 px too tall/);
  });

  test('the largest preset that fits is chosen, and none is an error', () => {
    const rest = { orientation: 'portrait', hand: 'right', lattice: 'square' } as const;
    expect(fitCellMm({ ...rest, columns: 9, rows: 9 })).toBe(15);
    expect(fitCellMm({ ...rest, columns: 14, rows: 18 })).toBe(10);
    expect(fitCellMm({ ...rest, columns: 20, rows: 25 })).toBe(7);
    expect(() => fitCellMm({ ...rest, columns: 30, rows: 30 })).toThrow(PageFitError);
  });

  test('the grid, clues and panel stay inside the area above the footer', () => {
    const layout = layoutPage({ ...spec, cellMm: 7, columns: 15, rows: 10, clues: { top: 4, left: 3 }, sidePanelMm: 20 });
    const { grid, sidePanel, footer } = layout;
    expect(sidePanel && sidePanel.x + sidePanel.width).toBeLessThan(grid.x);
    expect(grid.y + grid.rows * grid.cell).toBeLessThanOrEqual(footer.y);
    expect(sidePanel!.x).toBeGreaterThanOrEqual(footer.x);
  });

  test('the side panel goes away from the writing hand', () => {
    const right = layoutPage({ ...spec, cellMm: 10, sidePanelMm: 30 });
    const left = layoutPage({ ...spec, cellMm: 10, hand: 'left', sidePanelMm: 30 });
    expect(right.sidePanel!.x).toBeLessThan(right.grid.x);
    expect(left.sidePanel!.x).toBeGreaterThan(left.grid.x);
  });

  test('a side with no clues takes no room', () => {
    expect(layoutPage({ ...spec, clues: { top: 0, left: 0 } }).grid).toEqual(layoutPage(spec).grid);
  });

  test('outside clues on a hex grid are refused', () => {
    expect(() => layoutPage({ ...spec, lattice: 'hex', clues: { top: 2 } })).toThrow('square grid');
  });

  test('a footer rule longer than the page is an error, never cut off', () => {
    const layout = layoutPage(spec);
    const rule = 'Put every digit once in each row, each column and each box, '.repeat(3);
    expect(() => drawFooter(createPage(layout), layout, { game: 'Sudoku', difficulty: 'Hard', code: 'X', rule })).toThrow('too long');
  });
});

describe('text', () => {
  test('a character outside the page font is refused', () => {
    expect(() => drawText(createRaster(100, 100), 'É', 10, 50, { size: 40, weight: 400, tone: 'ink' })).toThrow('has no «É»');
  });
});

describe('toBase64 (#386)', () => {
  test.each([0, 1, 2, 3, 4, 5, 300])('matches Node for %i bytes', length => {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 0xff);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
