/**
 * Where a game's grid, its outside clues, a side panel and the footer go on the page (#379).
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
  readonly footer: Box;
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

/** The footer's two baselines, as shares of its height from its top. */
const FOOTER_BASELINES = { first: 0.42, second: 0.86 } as const;

const SIDES: readonly Side[] = ['top', 'left', 'bottom', 'right'];

/** Places the grid, its clues and the side panel in the area above the footer, centred. */
export function layoutPage(spec: PageSpec): PageLayout {
  if (!CELL_PRESETS_MM.includes(spec.cellMm)) throw new Error(`the cell presets are ${CELL_PRESETS_MM.join(', ')} mm, not ${spec.cellMm}`);
  const { width, height } = PAGE_SIZE[spec.orientation];
  const margin = mmToPx(PAGE_MM.margin);
  const footerHeight = mmToPx(PAGE_MM.footer);
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

  const areaWidth = width - 2 * margin;
  const areaHeight = height - 2 * margin - footerHeight;
  if (contentWidth > areaWidth || blockHeight > areaHeight) {
    throw new PageFitError(spec, contentWidth - areaWidth, blockHeight - areaHeight);
  }
  const left = margin + Math.floor((areaWidth - contentWidth) / 2);
  const top = margin + Math.floor((areaHeight - blockHeight) / 2);
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
    footer: { x: margin, y: height - margin - footerHeight, width: width - 2 * margin, height: footerHeight },
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
  const firstBaseline = footer.y + Math.round(footer.height * FOOTER_BASELINES.first);
  const secondBaseline = footer.y + Math.round(footer.height * FOOTER_BASELINES.second);
  drawText(raster, title, footer.x, firstBaseline, { ...style, weight: FONT_WEIGHTS.bold });
  drawText(raster, text.code, footer.x + footer.width, firstBaseline, { ...style, align: 'right' });
  drawText(raster, text.rule, footer.x, secondBaseline, style);
}
