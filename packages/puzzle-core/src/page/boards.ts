/**
 * The two-player pen boards (#402): dots and boxes, gomoku and ultimate tic-tac-toe, each with a
 * score area. Pass-and-play: the page holds no answer, no check and no state beyond the empty board.
 */
import { drawDotLattice, drawRegions, drawSquareLattice, type Grid } from './grid';
import { FONT_WEIGHTS, drawText } from './font';
import { createPage, drawFooter, layoutPage, type PageLayout, type PageSpec } from './layout';
import { LINE_PX, mmToPx, type CellPreset, type Hand, type Orientation } from './look';
import { fillRect, type Raster } from './raster';

export const BOARD_GAMES = ['dots-and-boxes', 'gomoku', 'ultimate-tic-tac-toe'] as const;
export type BoardGame = (typeof BOARD_GAMES)[number];

export interface BoardOptions {
  orientation?: Orientation;
  hand?: Hand;
}

interface BoardDefinition {
  title: string;
  rule: string;
  /** Short tag in the footer's right corner, in place of a puzzle code. */
  tag: string;
  cellMm: CellPreset;
  columns: number;
  rows: number;
  lattice: 'square';
  /** The score area's width: wide enough for «Player 1» at the panel's text size. */
  panelMm: number;
}

/** Dots and boxes: 8 x 10 boxes; gomoku: 15 x 15 squares; ultimate tic-tac-toe: 3 x 3 small boards of 3 x 3. */
const BOARDS: Record<BoardGame, BoardDefinition> = {
  'dots-and-boxes': {
    title: 'Dots and boxes',
    rule: 'Draw one line between two dots in turn; a closed box scores and plays again.',
    tag: '2 players',
    cellMm: 10,
    columns: 8,
    rows: 10,
    lattice: 'square',
    panelMm: 30,
  },
  gomoku: {
    title: 'Gomoku',
    rule: 'Take turns marking a square; the first to make five in a row wins.',
    tag: '2 players',
    cellMm: 7,
    columns: 15,
    rows: 15,
    lattice: 'square',
    panelMm: 30,
  },
  'ultimate-tic-tac-toe': {
    title: 'Ultimate tic-tac-toe',
    rule: 'Your square sends your opponent to that small board; win three boards in a row.',
    tag: '2 players',
    cellMm: 10,
    columns: 9,
    rows: 9,
    lattice: 'square',
    panelMm: 30,
  },
};

const SCORE_TEXT = { size: 48, label: 60, boxHeightMm: 22, boxGap: 20 } as const;
/** Ultimate tic-tac-toe: each small board is this many cells across. */
const SMALL_BOARD = 3;
const PLAYERS = ['Player 1', 'Player 2'] as const;

/** The score area: a heading, then a name and a blank box for each player to write the count in. */
function drawScoreArea(raster: Raster, layout: PageLayout): void {
  const panel = layout.sidePanel;
  if (!panel) throw new Error('a board page has a score area');
  const style = { size: SCORE_TEXT.size, weight: FONT_WEIGHTS.bold, tone: 'ink' } as const;
  drawText(raster, 'Score', panel.x, panel.y + SCORE_TEXT.label, style);
  const boxHeight = mmToPx(SCORE_TEXT.boxHeightMm);
  const step = SCORE_TEXT.label * 2 + boxHeight;
  PLAYERS.forEach((name, i) => {
    const top = panel.y + SCORE_TEXT.label * 2 + i * step;
    drawText(raster, name, panel.x, top + SCORE_TEXT.label, { ...style, weight: FONT_WEIGHTS.regular });
    const boxTop = top + SCORE_TEXT.label + SCORE_TEXT.boxGap;
    const w = LINE_PX.grid;
    fillRect(raster, panel.x, boxTop, panel.width, w, 'line');
    fillRect(raster, panel.x, boxTop + boxHeight - w, panel.width, w, 'line');
    fillRect(raster, panel.x, boxTop, w, boxHeight, 'line');
    fillRect(raster, panel.x + panel.width - w, boxTop, w, boxHeight, 'line');
  });
}

function drawBoard(game: BoardGame, raster: Raster, grid: Grid): void {
  if (game === 'dots-and-boxes') {
    drawDotLattice(raster, grid);
    return;
  }
  drawSquareLattice(raster, grid);
  if (game === 'ultimate-tic-tac-toe') {
    drawRegions(raster, grid, (c, r) => Math.floor(c / SMALL_BOARD) + SMALL_BOARD * Math.floor(r / SMALL_BOARD));
  }
}

/** How a board is played, as its page's footer says it: the Puzzles list shows it too (#402). */
export const boardRule = (game: BoardGame): string => BOARDS[game].rule;

/** The page of a two-player board, as one `Raster`; encode it with `encodePng` for a page background. */
export function renderBoardPage(game: BoardGame, options: BoardOptions = {}): Raster {
  const def = BOARDS[game];
  if (!def) throw new Error(`the boards are ${BOARD_GAMES.join(', ')}, not ${String(game)}`);
  const spec: PageSpec = {
    orientation: options.orientation ?? 'portrait',
    hand: options.hand ?? 'right',
    cellMm: def.cellMm,
    lattice: def.lattice,
    columns: def.columns,
    rows: def.rows,
    sidePanelMm: def.panelMm,
  };
  const layout = layoutPage(spec);
  const raster = createPage(layout);
  drawBoard(game, raster, layout.grid);
  drawScoreArea(raster, layout);
  drawFooter(raster, layout, { game: def.title, difficulty: 'Pass and play', code: def.tag, rule: def.rule });
  return raster;
}
