/**
 * Where a game's grid, its outside clues, a side or a lower panel and the footer go on the page
 * (#379, the lower panel #400).
 * Everything must fit on one page: a layout that does not throws `PageFitError`, never clips.
 */
import { FONT_WEIGHTS, drawText, measureText } from './font';
import { gridSize, latticeCell, outsideSlot, type Grid, type Lattice, type Side } from './grid';
import { CELL_PRESETS_MM, PAGE_MM, PAGE_SIZE, TEXT_SIZE, mmToPx, type CellPreset, type Hand, type Orientation } from './look';
import { createRaster, type Raster } from './raster';

export interface PageSpec {
  orientation: Orientation;
  hand: Hand;
  cellMm: CellPreset;
  lattice: Lattice;
  columns: number;
  rows: number;
  /** How many outside clues stack on each side (a nonogram's longest run list); 0 or absent for none. */
  clues?: Partial<Record<Side, number>>;
  /** A panel beside the grid (a word search's list), in millimetres wide. */
  sidePanelMm?: number;
  /** A panel below the grid as wide as the page's text area (a crossword's clues), in millimetres high. */
  belowPanelMm?: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PageLayout {
  readonly width: number;
  readonly height: number;
  readonly grid: Grid;
  /** The gap between the grid and its outside clues, for `drawOutsideClues`. */
  readonly clueGap: number;
  readonly sidePanel: Box | null;
  readonly belowPanel: Box | null;
  readonly footer: Box;
  /** The page layout it was laid out by, which places the footer's lines. */
  readonly version: PageLayoutVersion;
}

export class PageFitError extends Error {
  constructor(spec: PageSpec, overWidth: number, overHeight: number) {
    super(
      `a ${spec.columns} x ${spec.rows} ${spec.lattice} grid at ${spec.cellMm} mm does not fit a ${spec.orientation} page: ` +
        `${Math.max(0, overWidth)} px too wide, ${Math.max(0, overHeight)} px too tall`,
    );
    this.name = 'PageFitError';
  }
}

/**
 * The page layouts a page was drawn by. A page in a note keeps the layout it was printed with, as
 * its background is that picture: «Check» reads the ink against the grid it was drawn in, and
 * «Show Solution» draws on the same page. 1 is the layout before the page bar margin (#553): an
 * 8 mm bottom margin, a 12 mm footer and no gap above it; 2 keeps the footer above the page bar by
 * half a millimetre; 3 keeps it 2.5 mm above the bar (#553), which the owner's photo of a layout 1 page
 * showed crowding the bar.
 */
export type PageLayoutVersion = 1 | 2 | typeof PAGE_LAYOUT;
/** The layout a new page is drawn by. A change that moves a grid on the page adds a version. */
export const PAGE_LAYOUT = 3;

interface LayoutMeasures {
  bottomMm: number;
  footerMm: number;
  /** Whether the grid keeps `PAGE_MM.gap` above the footer (#553). */
  gapAboveFooter: boolean;
  /** The footer's two baselines, as shares of its height from its top. */
  baselines: { first: number; second: number };
}

const LAYOUTS: Record<PageLayoutVersion, LayoutMeasures> = {
  1: { bottomMm: PAGE_MM.margin, footerMm: 12, gapAboveFooter: false, baselines: { first: 0.42, second: 0.86 } },
  2: { bottomMm: PAGE_MM.bottom, footerMm: PAGE_MM.footer, gapAboveFooter: true, baselines: { first: 0.4, second: 0.88 } },
  3: { bottomMm: PAGE_MM.pageBar + PAGE_MM.barClearance, footerMm: PAGE_MM.footer, gapAboveFooter: true, baselines: { first: 0.4, second: 0.88 } },
};

let activeLayout: PageLayoutVersion = PAGE_LAYOUT;

/**
 * Runs `draw` with every page it lays out laid out by `version`, then goes back to the current
 * layout: the Puzzles view opens a page made earlier inside it, so its grid and footer are where
 * that page printed them. A game's page and its «Check» grid are both laid out while it opens.
 */
export function withPageLayout<T>(version: PageLayoutVersion, draw: () => T): T {
  const was = activeLayout;
  activeLayout = version;
  try {
    return draw();
  } finally {
    activeLayout = was;
  }
}

/** The mark of the page layout in a page's background name: `L`, which no seed holds, and the version. */
const LAYOUT_MARK = /^L(\d+)$/;

/** A page's background name for a code: the code and the layout it is drawn by, `SU-9-H-7K2Q9X-L2`. */
export function placedPageCode(code: string, version: PageLayoutVersion = PAGE_LAYOUT): string {
  return `${code}-L${version}`;
}

/** Whether this version can draw the page layout a background name holds. */
export function knownPageLayout(name: string): boolean {
  const mark = LAYOUT_MARK.exec(name.slice(name.lastIndexOf('-') + 1).toUpperCase());
  return !mark || Number(mark[1]) in LAYOUTS;
}

/** The code and page layout a background name holds; a name with no mark is a page of layout 1. */
export function pageCodeParts(name: string): { code: string; version: PageLayoutVersion } {
  const at = name.lastIndexOf('-');
  const mark = LAYOUT_MARK.exec(name.slice(at + 1).toUpperCase());
  const version = mark ? Number(mark[1]) : 1;
  if (!(version in LAYOUTS)) throw new RangeError(`«${name}» names page layout ${version}, which this version cannot draw`);
  return mark ? { code: name.slice(0, at), version: version as PageLayoutVersion } : { code: name, version: 1 };
}

const SIDES: readonly Side[] = ['top', 'left', 'bottom', 'right'];

/** Places the grid, its clues and the side panel in the area above the footer, centred. */
export function layoutPage(spec: PageSpec): PageLayout {
  if (!CELL_PRESETS_MM.includes(spec.cellMm)) throw new Error(`the cell presets are ${CELL_PRESETS_MM.join(', ')} mm, not ${spec.cellMm}`);
  const { width, height } = PAGE_SIZE[spec.orientation];
  const margin = mmToPx(PAGE_MM.margin);
  const measures = LAYOUTS[activeLayout];
  const bottom = mmToPx(measures.bottomMm);
  const footerHeight = mmToPx(measures.footerMm);
  const gap = mmToPx(PAGE_MM.gap);
  const cell = latticeCell(spec.lattice, mmToPx(spec.cellMm));
  const size = gridSize(spec.lattice, cell, spec.columns, spec.rows);
  const gridWidth = Math.ceil(size.width);
  const gridHeight = Math.ceil(size.height);

  const depth: Record<Side, number> = { top: 0, left: 0, bottom: 0, right: 0 };
  for (const side of SIDES) {
    const count = spec.clues?.[side] ?? 0;
    if (count > 0 && spec.lattice !== 'square') throw new Error(`outside clues need a square grid, not a ${spec.lattice} one`);
    depth[side] = count > 0 ? gap + count * outsideSlot(cell) : 0;
  }
  const panelWidth = spec.sidePanelMm ? mmToPx(spec.sidePanelMm) : 0;
  const blockWidth = depth.left + gridWidth + depth.right;
  const blockHeight = depth.top + gridHeight + depth.bottom;
  const contentWidth = blockWidth + (panelWidth > 0 ? gap + panelWidth : 0);
  const belowHeight = spec.belowPanelMm ? mmToPx(spec.belowPanelMm) : 0;
  const contentHeight = blockHeight + (belowHeight > 0 ? gap + belowHeight : 0);

  const areaWidth = width - 2 * margin;
  // The gap keeps the grid's lowest line clear of the footer's first line, as it does the clues (#553).
  const areaHeight = height - margin - bottom - footerHeight - (measures.gapAboveFooter ? gap : 0);
  if (contentWidth > areaWidth || contentHeight > areaHeight) {
    throw new PageFitError(spec, contentWidth - areaWidth, contentHeight - areaHeight);
  }
  const left = margin + Math.floor((areaWidth - contentWidth) / 2);
  const top = margin + Math.floor((areaHeight - contentHeight) / 2);
  // The panel goes on the side away from the writing hand, so the hand never covers it.
  const panelFirst = panelWidth > 0 && spec.hand === 'right';
  const blockLeft = panelFirst ? left + panelWidth + gap : left;
  const sidePanel =
    panelWidth > 0
      ? { x: panelFirst ? left : blockLeft + blockWidth + gap, y: top, width: panelWidth, height: blockHeight }
      : null;
  return {
    width,
    height,
    grid: { lattice: spec.lattice, x: blockLeft + depth.left, y: top + depth.top, cell, columns: spec.columns, rows: spec.rows },
    clueGap: gap,
    sidePanel,
    belowPanel: belowHeight > 0 ? { x: margin, y: top + blockHeight + gap, width: areaWidth, height: belowHeight } : null,
    footer: { x: margin, y: height - bottom - footerHeight, width: width - 2 * margin, height: footerHeight },
    version: activeLayout,
  };
}

/** The largest cell preset at which the grid and its clues fit; throws when even the smallest does not. */
export function fitCellMm(spec: Omit<PageSpec, 'cellMm'>): CellPreset {
  let error: unknown;
  for (const cellMm of [...CELL_PRESETS_MM].reverse()) {
    try {
      layoutPage({ ...spec, cellMm });
      return cellMm;
    } catch (e) {
      if (!(e instanceof PageFitError)) throw e;
      error = e;
    }
  }
  throw error;
}

/** A blank page of the layout's size. */
export function createPage(layout: PageLayout): Raster {
  return createRaster(layout.width, layout.height);
}

export interface FooterText {
  game: string;
  difficulty: string;
  /** The puzzle code a person types to get the same puzzle again. */
  code: string;
  /** One line that says how to play. */
  rule: string;
}

/**
 * The footer: the game and difficulty at the start and the puzzle code at the end of the first
 * line, the rule on the second, in the line grey.
 */
export function drawFooter(raster: Raster, layout: PageLayout, text: FooterText): void {
  const { footer } = layout;
  const size = mmToPx(TEXT_SIZE.footerMm);
  const style = { size, weight: FONT_WEIGHTS.regular, tone: 'line' } as const;
  const title = `${text.game} · ${text.difficulty}`;
  const titleWidth = measureText(title, size, FONT_WEIGHTS.bold) + size + measureText(text.code, size, FONT_WEIGHTS.regular);
  if (titleWidth > footer.width) throw new Error(`the footer's first line is ${Math.ceil(titleWidth - footer.width)} px too long`);
  const ruleWidth = measureText(text.rule, size, FONT_WEIGHTS.regular);
  if (ruleWidth > footer.width) throw new Error(`the footer's rule is ${Math.ceil(ruleWidth - footer.width)} px too long: «${text.rule}»`);
  const { baselines } = LAYOUTS[layout.version];
  const firstBaseline = footer.y + Math.round(footer.height * baselines.first);
  const secondBaseline = footer.y + Math.round(footer.height * baselines.second);
  drawText(raster, title, footer.x, firstBaseline, { ...style, weight: FONT_WEIGHTS.bold });
  drawText(raster, text.code, footer.x + footer.width, firstBaseline, { ...style, align: 'right' });
  drawText(raster, text.rule, footer.x, secondBaseline, style);
}
