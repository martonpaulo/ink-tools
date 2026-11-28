/**
 * The Word search game (#385): a theme of the chosen language and band picked from the seed, its
 * grid from `generateWordSearch` with the language's avoid list, the page drawn with the shared
 * renderer, and «Check» over the player's straight strikes. The words come in as a source, so this
 * module bundles no word list: the caller passes `WORD_LISTS[language]` and `WORD_AVOID[language]`
 * from `words-data.ts`.
 *
 * The puzzle code names the language in its size token: `WS-15PT-H-7K2Q9X` is a 15 x 15 hard
 * Portuguese word search, so a typed code gives back the same theme and grid.
 */
import { parsePuzzleCode, puzzleCode, type Difficulty, type PuzzleId } from '../code';
import { type InkStroke } from '../check/cells';
import { strokeSpan } from '../check/lines';
import { capHeight, drawText, FONT_WEIGHTS, measureText } from '../page/font';
import { cellCenter, drawCellText, drawSquareLattice, type Grid } from '../page/grid';
import { createPage, drawFooter, fitCellMm, layoutPage, type PageLayout, type PageSpec } from '../page/layout';
import { mmToPx, TEXT_SIZE, type Hand, type Orientation } from '../page/look';
import { type Raster } from '../page/raster';
import { copyRaster, drawPolyline, drawStrikeCheck, VIEW_ANSWER_PX, type Segment } from '../page/view';
import { childSeed, createRandom } from '../random';
import { DIRECTIONS, generateWordSearch, type WordSearch } from '../word-search';
import { WORD_LANGUAGES, type ThemeTier, type WordLanguage, type WordList } from '../words';

export type WordSearchBand = ThemeTier;
export const WORD_SEARCH_GAME_BANDS: readonly WordSearchBand[] = ['easy', 'medium', 'hard'];

/** The grid's side per band: the largest, 15, still fits a portrait page with its list at 7 mm. */
export const WORD_SEARCH_SIDES: Readonly<Record<WordSearchBand, number>> = { easy: 12, medium: 13, hard: 15 };

/** The words of one language a game reads: its list with the themes, and the filler's avoid list. */
export interface WordSearchSource {
  list: WordList;
  avoid: readonly string[];
}

export interface WordSearchGame {
  language: WordLanguage;
  band: WordSearchBand;
  /** The theme's name in the language, the list's title on the page, in the page font's letters. */
  theme: string;
  /** The words as the page lists them, in the language's alphabet order. */
  words: string[];
  puzzle: WordSearch;
  /** The code a person types to get this puzzle again. */
  code: string;
}

const RULES: Readonly<Record<WordSearchBand, string>> = {
  easy: 'Strike each word of the list with one straight line: across or down.',
  medium: 'Strike each word of the list with one straight line: across, down or diagonal.',
  hard: 'Strike each word of the list with one straight line, in any direction, backwards too.',
};
const BAND_NAMES: Readonly<Record<WordSearchBand, string>> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** The theme's words that can stand in the grid: no longer than the side, none twice, none inside another. */
function playableWords(words: readonly string[], side: number): string[] {
  const fit = [...new Set(words)].filter(word => [...word].length <= side);
  const reversed = (word: string): string => [...word].reverse().join('');
  return fit.filter(word => !fit.some(other => other !== word && (other.includes(word) || other.includes(reversed(word)))));
}

function alphabetOrder(alphabet: string): (a: string, b: string) => number {
  const rank = new Map([...alphabet].map((letter, i) => [letter, i]));
  return (a, b) => {
    const x = [...a];
    const y = [...b];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d = (rank.get(x[i]) ?? 0) - (rank.get(y[i]) ?? 0);
      if (d !== 0) return d;
    }
    return x.length - y.length;
  };
}

/**
 * The theme's name in the page font's letters: accents dropped (Música reads Musica), Ñ kept, as
 * the font holds A to Z, Ñ and no other accented letter.
 */
export function pageTitle(name: string): string {
  return name
    .split(/(ñ|Ñ)/)
    .map(part => (/^[ñÑ]$/.test(part) ? part : part.normalize('NFD').replace(/\p{M}/gu, '')))
    .join('');
}

function sizeToken(side: number, language: WordLanguage): string {
  return `${side}${language.toUpperCase()}`;
}

/** A new word search of the language and band from the seed. Throws on a list with no theme of that band. */
export function newWordSearch(seed: string, language: WordLanguage, band: WordSearchBand, source: WordSearchSource): WordSearchGame {
  if (!WORD_SEARCH_GAME_BANDS.includes(band)) throw new RangeError(`a word search offers ${WORD_SEARCH_GAME_BANDS.join(', ')}, not ${band}`);
  if (source.list.language !== language) throw new Error(`the ${source.list.language} list was passed for a ${language} word search`);
  const themes = source.list.themes.filter(theme => theme.tier === band);
  if (themes.length === 0) throw new Error(`the ${language} list has no ${band} theme`);
  const theme = createRandom(childSeed(seed, 'theme')).pick(themes);
  const side = WORD_SEARCH_SIDES[band];
  const words = playableWords(theme.words, side).sort(alphabetOrder(source.list.alphabet));
  const grid = generateWordSearch(seed, side, band, words, { alphabet: source.list.alphabet, avoid: source.avoid });
  const id: PuzzleId = { ...grid.id, size: sizeToken(side, language) };
  const puzzle = { ...grid, id };
  return { language, band, theme: pageTitle(theme.name), words, puzzle, code: puzzleCode(id) };
}

/** The word search a code names, from the sources of every language. Throws naming the wrong part. */
export function wordSearchFromCode(code: string, sources: Readonly<Record<WordLanguage, WordSearchSource>>): WordSearchGame {
  const id = parsePuzzleCode(code);
  if (id.game !== 'word-search') throw new RangeError(`«${code}» is a ${id.game} code, not a word search one`);
  const match = /^(\d+)([A-Z]{2})$/.exec(id.size);
  const language = WORD_LANGUAGES.find(lang => match && lang.toUpperCase() === match[2]);
  if (!match || !language) throw new RangeError(`«${id.size}» is not a side and one of ${WORD_LANGUAGES.join(', ')}`);
  const band = id.difficulty as Difficulty;
  if (!WORD_SEARCH_GAME_BANDS.includes(band as WordSearchBand)) throw new RangeError(`a word search offers ${WORD_SEARCH_GAME_BANDS.join(', ')}, not ${band}`);
  if (Number(match[1]) !== WORD_SEARCH_SIDES[band as WordSearchBand]) throw new RangeError(`a ${band} word search is ${WORD_SEARCH_SIDES[band as WordSearchBand]} cells wide, not ${match[1]}`);
  return newWordSearch(id.seed, language, band as WordSearchBand, sources[language]);
}

export interface WordSearchPageChoice {
  orientation: Orientation;
  hand: Hand;
}

function listStyle(): { size: number; step: number } {
  const size = mmToPx(TEXT_SIZE.listMm);
  return { size, step: Math.round(size * TEXT_SIZE.listLeading) };
}

/** The panel's width in whole millimetres: the widest of the title and the words. */
function panelMm(game: WordSearchGame): number {
  const { size } = listStyle();
  const widest = Math.max(
    measureText(game.theme, size, FONT_WEIGHTS.bold),
    ...game.words.map(word => measureText(word, size, FONT_WEIGHTS.regular)),
  );
  let mm = 1;
  while (mmToPx(mm) < widest) mm++;
  return mm;
}

/**
 * Where the grid, the list and the footer go: the largest cell preset at which the grid and the
 * list fit. Throws `PageFitError` when even 7 mm does not, and an error when the list is taller
 * than the grid. «Check» reads the ink against this layout's grid.
 */
export function wordSearchLayout(game: WordSearchGame, page: WordSearchPageChoice): PageLayout {
  const side = game.puzzle.size;
  const spec: Omit<PageSpec, 'cellMm'> = { ...page, lattice: 'square', columns: side, rows: side, sidePanelMm: panelMm(game) };
  const layout = layoutPage({ ...spec, cellMm: fitCellMm(spec) });
  const { step } = listStyle();
  const listHeight = (game.words.length + 2) * step;
  if (layout.sidePanel && listHeight > layout.sidePanel.height) {
    throw new Error(`the list of ${game.words.length} words is ${listHeight - layout.sidePanel.height} px taller than the grid`);
  }
  return layout;
}

/** The puzzle's page: the letters in the grid, the theme and its words beside it, the footer. Never the answer. */
export function drawWordSearchPage(game: WordSearchGame, page: WordSearchPageChoice): { layout: PageLayout; raster: Raster } {
  const layout = wordSearchLayout(game, page);
  const raster = createPage(layout);
  const { grid, sidePanel } = layout;
  const side = game.puzzle.size;
  drawSquareLattice(raster, grid);
  game.puzzle.letters.forEach((letter, i) => drawCellText(raster, grid, i % side, Math.floor(i / side), letter, 'given'));
  if (sidePanel) {
    const { size, step } = listStyle();
    const first = sidePanel.y + Math.round(capHeight(size));
    drawText(raster, game.theme, sidePanel.x, first, { size, weight: FONT_WEIGHTS.bold, tone: 'ink' });
    game.words.forEach((word, i) =>
      drawText(raster, word, sidePanel.x, first + (i + 2) * step, { size, weight: FONT_WEIGHTS.regular, tone: 'ink' }),
    );
  }
  drawFooter(raster, layout, { game: 'Word search', difficulty: BAND_NAMES[game.band], code: game.code, rule: RULES[game.band] });
  return { layout, raster };
}

export interface WrongStrike {
  /** The stroke's index in the strokes given. */
  stroke: number;
  /** The cells it strikes, first end first: every cell on its line, or its two ends when it is on no grid line. */
  cells: number[];
}

export interface WordSearchCheck {
  /** The words a strike finds, in the page's list order. */
  found: string[];
  /** The words no strike finds yet. */
  missing: string[];
  /** The straight strikes over no word of the list: what «Check» marks. */
  wrong: WrongStrike[];
}

/**
 * [inference] a strike's end this near, in cells, to the centre of a word's end letter strikes
 * that letter: a pen often starts a little before the first letter and stops a little past the last.
 */
export const STRIKE_END_REACH = 0.8;

function lineCells(columns: number, from: number, to: number): number[] {
  const [r0, c0, r1, c1] = [Math.floor(from / columns), from % columns, Math.floor(to / columns), to % columns];
  const dr = Math.sign(r1 - r0);
  const dc = Math.sign(c1 - c0);
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  const onLine = Object.values(DIRECTIONS).some(([a, b]) => a === dr && b === dc) && (r0 + dr * steps === r1 && c0 + dc * steps === c1);
  if (!onLine) return [from, to];
  return Array.from({ length: steps + 1 }, (_, i) => (r0 + dr * i) * columns + c0 + dc * i);
}

/**
 * «Check» for a word search: each straight stroke longer than a cell is a strike. A strike whose
 * two ends reach a listed word's two end letters finds that word; any other strike is wrong. A
 * stroke that is not straight, or that ends off the grid, is not a strike and is left out, so a
 * scribble raises no false alarm. Reads geometry only: no recognition, no write to the note.
 *
 * shortcut: strikes only; a ring drawn around a word is left out, until the device round shows players ring words.
 */
export function checkWordSearch(game: WordSearchGame, grid: Grid, strokes: readonly InkStroke[]): WordSearchCheck {
  const side = game.puzzle.size;
  if (grid.lattice !== 'square' || grid.columns !== side || grid.rows !== side) {
    throw new Error(`the grid is not this word search's ${side} x ${side} square grid`);
  }
  const centre = (cell: number): [number, number] => cellCenter(grid, cell % side, Math.floor(cell / side));
  const reach = STRIKE_END_REACH * grid.cell;
  const found = new Set<string>();
  const wrong: WrongStrike[] = [];
  strokes.forEach((stroke, index) => {
    const span = strokeSpan(grid, stroke);
    const { points } = stroke;
    if (!span || !span.straight) return;
    const [a, b] = [points[0], points[points.length - 1]];
    if (Math.hypot(b.x - a.x, b.y - a.y) < grid.cell) return;
    const distance = (p: { x: number; y: number }, cell: number): number => {
      const [x, y] = centre(cell);
      return Math.hypot(p.x - x, p.y - y);
    };
    let best: { word: string; error: number } | null = null;
    for (const placed of game.puzzle.words) {
      const first = placed.cells[0];
      const last = placed.cells[placed.cells.length - 1];
      for (const [p, q] of [[first, last], [last, first]]) {
        const [da, db] = [distance(a, p), distance(b, q)];
        if (da <= reach && db <= reach && (!best || da + db < best.error)) best = { word: placed.word, error: da + db };
      }
    }
    if (best) found.add(best.word);
    else wrong.push({ stroke: index, cells: lineCells(side, span.from, span.to) });
  });
  return {
    found: game.words.filter(word => found.has(word)),
    missing: game.words.filter(word => !found.has(word)),
    wrong,
  };
}

/** The line from the centre of a strike's first cell to the centre of its last. */
function strikeLine(grid: Grid, cells: readonly number[]): Segment {
  const side = grid.columns;
  const at = (cell: number): [number, number] => cellCenter(grid, cell % side, Math.floor(cell / side));
  return [at(cells[0]), at(cells[cells.length - 1])];
}

/** The page «Check» shows, for the plugin's view only: the player's ink and a ring around each wrong strike. */
export function drawWordSearchCheck(page: Raster, grid: Grid, strokes: readonly InkStroke[], wrong: readonly WrongStrike[]): Raster {
  return drawStrikeCheck(page, grid, strokes, wrong.map(strike => strikeLine(grid, strike.cells)));
}

/** The page with the answer, for the plugin's view only: one line through each listed word, as a player strikes it. */
export function drawWordSearchAnswer(game: WordSearchGame, page: Raster, grid: Grid): Raster {
  const answer = copyRaster(page);
  for (const placed of game.puzzle.words) drawPolyline(answer, strikeLine(grid, placed.cells), VIEW_ANSWER_PX);
  return answer;
}
