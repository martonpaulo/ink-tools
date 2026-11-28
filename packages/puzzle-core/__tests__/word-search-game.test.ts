import avoidData from '../words/avoid.json';
import sources from '../words/sources.json';
import { type InkPoint, type InkStroke } from '../src/check';
import {
  checkWordSearch,
  drawWordSearchAnswer,
  drawWordSearchCheck,
  drawWordSearchPage,
  newWordSearch,
  pageTitle,
  WORD_SEARCH_GAME_BANDS,
  wordSearchFromCode,
  wordSearchLayout,
  type WordSearchGame,
  type WordSearchSource,
} from '../src/games/word-search';
import { cellCenter } from '../src/page/grid';
import { assertNativeGreys } from '../src/page/raster';
import { avoidedReading, generateWordSearch } from '../src/word-search';
import { WORD_AVOID, WORD_LISTS } from '../src/words-data';
import { gridPattern, WORD_LANGUAGES, type WordLanguage } from '../src/words';

const source = (language: WordLanguage): WordSearchSource => ({ list: WORD_LISTS[language], avoid: WORD_AVOID[language] });
const SOURCES = Object.fromEntries(WORD_LANGUAGES.map(language => [language, source(language)])) as Record<WordLanguage, WordSearchSource>;
const rows = (game: WordSearchGame): string[] =>
  Array.from({ length: game.puzzle.size }, (_, r) => game.puzzle.letters.slice(r * game.puzzle.size, (r + 1) * game.puzzle.size).join(''));
const fillerOf = (game: WordSearchGame): boolean[] => {
  const placed = new Set(game.puzzle.words.flatMap(word => word.cells));
  return game.puzzle.letters.map((_, cell) => !placed.has(cell));
};

describe('newWordSearch', () => {
  test.each([
    ['en', 'easy', 'WS-12EN-E-7K2Q9X', 'Animals', ['BEAR', 'CAT', 'DOG', 'DUCK', 'FISH', 'FROG', 'GOAT', 'LION', 'OWL', 'WOLF'],
      ['VTHWOLFMELOP', 'ECDIURSGPSWU', 'DOGJMJFXRSLM', 'ELRKKJRSLNME', 'PPFRYDOFWKNQ', 'PXITLUGCLYFG', 'QYYMQCBAIPBO', 'EUSTCKUTOYEA', 'OXFPNQKXNGAT', 'DAVRTXSUHYRA', 'KURAXLZRFISH', 'XYMPATGDOHDQ']],
    ['pt', 'medium', 'WS-13PT-M-7K2Q9X', 'Videogames', ['AVATAR', 'CHEFE', 'COMBO', 'FLIPERAMA', 'JOGADOR', 'MISSAO', 'NIVEL', 'PIXEL', 'PONTOS', 'TESOURO', 'VIDA'],
      ['YMQPIXELBPEMC', 'STCUYOXFAPNIQ', 'KXGDAVRMTXSSU', 'HTYAKUAVRAXSL', 'ZREXYRMIPATAG', 'DOHSEJDDQUYOC', 'XSHPOUOACSQAO', 'DKIWEUIGBHIKM', 'MLTZHGRKAVEVB', 'FPONTOSOBDQFO', 'NZHOYKKKZIOHE', 'NIVELAVATARRD', 'CIXXFSRXVWCZS']],
    ['es', 'hard', 'WS-15ES-H-7K2Q9X', 'Ordenadores', ['BINARIO', 'BUCLE', 'CIFRADO', 'COMPILADOR', 'FUNCION', 'MEMORIA', 'NUCLEO', 'PROCESADOR', 'PUNTERO', 'RED', 'TECLADO', 'VARIABLE'],
      ['IKRSPODARFICTGO', 'WVNMEMORIAFÑBÑY', 'PPTUFUKNRXQVUER', 'BREKLRMCOOIBCNE', 'FOCSREDORZQMLVL', 'BCLEXXZMEGZHEKB', 'JEAHTSQPTWLCWBA', 'ZSDATBBINARIOFI', 'MAOZTICLUPEXGRR', 'GDOEHÑTAPCZXVJA', 'LOEUZNKDSGTTEYV', 'JRLUPÑQOWFHFVUX', 'MCCDÑXARJOFLQSX', 'YTUFFUNCIONUTÑU', 'UHNFROLAGDXNMPZ']],
    ['de', 'medium', 'WS-13DE-M-7K2Q9X', 'Gaming', ['ARKADE', 'AVATAR', 'BEUTE', 'BOSS', 'COMBO', 'LEVEL', 'PIXEL', 'PUNKTE', 'QUEST', 'RESPAWN', 'SPIELER'],
      ['YMQQUESTBPEPC', 'STCUYOXFBPNUQ', 'KXGLEVELEDANV', 'RATXSUHBUYAKK', 'URVAXELOTZRTX', 'YMPADATSEGDES', 'COHATDQSUYRXP', 'SOKHUASQADEKI', 'ARMEIBRIKMSTE', 'AUHBGKVVBQPNL', 'ZHOYOKKKZIAHE', 'PIXELDCIXXWFR', 'SRXVWCZSWZNQS']],
    ['fr', 'hard', 'WS-15FR-H-7K2Q9X', 'Informatique', ['BINAIRE', 'BOUCLE', 'CHIFFREMENT', 'CLAVIER', 'COMPILATEUR', 'FONCTION', 'MEMOIRE', 'NOYAU', 'POINTEUR', 'PROCESSEUR', 'RESEAU', 'VARIABLE'],
      ['WUHARUETNIOPCRA', 'RBNVARIABLECOPR', 'BCREUOYZKWGKMGU', 'OOEVSFYCRESTBUE', 'VMSERXJHERTDOKS', 'WPEOXSYIIILZNWS', 'FIARQYDFVOYHOEE', 'VLUMVAAFAMKVIHC', 'JAVHPOYRLEGUTTO', 'TTJCEJTECMCWCUR', 'NEUFLIFMYIQWNIP', 'OUOLCLKEJSNPOAS', 'YRPOUPDNTUIQFXS', 'AJHAOWFTERIANIB', 'USUIBVMEYBVIZGQ']],
  ] as const)('%s %s from seed 7K2Q9X is pinned', (language, band, code, theme, words, grid) => {
    const game = newWordSearch('7K2Q9X', language, band, source(language));
    expect(game.code).toBe(code);
    expect(game.theme).toBe(theme);
    expect(game.words).toEqual(words);
    expect(rows(game)).toEqual(grid);
  });

  test('a code gives back the same game, in any language', () => {
    for (const language of WORD_LANGUAGES) {
      const game = newWordSearch('Q4', language, 'hard', source(language));
      expect(wordSearchFromCode(game.code.toLowerCase(), SOURCES)).toEqual(game);
    }
  });

  test.each([
    ['SU-9-H-Q4', 'a sudoku code'],
    ['WS-15XX-H-Q4', 'is not a side and one of'],
    ['WS-12EN-H-Q4', 'is 15 cells wide, not 12'],
    ['WS-15EN-X-Q4', 'not expert'],
  ])('the code %s is refused: %s', (code, why) => {
    expect(() => wordSearchFromCode(code, SOURCES)).toThrow(why);
  });

  test('the theme comes from the band’s tier and its words all stand in the grid once', () => {
    for (const band of WORD_SEARCH_GAME_BANDS) {
      const game = newWordSearch('T1', 'pt', band, source('pt'));
      const theme = WORD_LISTS.pt.themes.find(t => pageTitle(t.name) === game.theme && t.tier === band);
      expect(theme).toBeDefined();
      expect(game.puzzle.words.map(w => w.word).sort()).toEqual([...game.words].sort());
    }
  });

  test('a Portuguese title drops its accents for the page font, a Spanish one keeps Ñ', () => {
    expect(pageTitle('Música')).toBe('Musica');
    expect(pageTitle('Corações')).toBe('Coracoes');
    expect(pageTitle('España')).toBe('España');
  });

  test('every theme of every language and band fits a portrait and a landscape page, either hand', () => {
    for (const language of WORD_LANGUAGES) {
      for (const theme of WORD_LISTS[language].themes) {
        const one = { list: { ...WORD_LISTS[language], themes: [theme] }, avoid: WORD_AVOID[language] };
        const game = newWordSearch('F1T', language, theme.tier, one);
        for (const orientation of ['portrait', 'landscape'] as const) {
          for (const hand of ['right', 'left'] as const) expect(() => wordSearchLayout(game, { orientation, hand })).not.toThrow();
        }
      }
    }
  });
});

describe('the avoid list', () => {
  test('the filler never spells an avoided word, but a placed word may hold one', () => {
    for (let s = 0; s < 10; s++) {
      const puzzle = generateWordSearch(`A${s}`, 8, 'hard', ['GATO', 'SAPO'], { avoid: ['E', 'QX'] });
      const placed = new Set(puzzle.words.flatMap(word => word.cells));
      puzzle.letters.forEach((letter, cell) => placed.has(cell) || expect(letter).not.toBe('E'));
    }
    const kept = generateWordSearch('A', 8, 'hard', ['BASSO'], { avoid: ['ASS'] });
    expect(kept.words[0].word).toBe('BASSO');
  });

  test('a grid of each language spells no avoided word through its filler', () => {
    for (const language of WORD_LANGUAGES) {
      for (let s = 0; s < 8; s++) {
        const game = newWordSearch(`V${s}`, language, 'hard', source(language));
        expect(avoidedReading(game.puzzle.size, game.puzzle.letters, fillerOf(game), WORD_AVOID[language])).toBeNull();
      }
    }
  });

  test('the bundled lists are folded grid words of three letters or more, from sources the manifest pins', () => {
    for (const language of WORD_LANGUAGES) {
      const words = WORD_AVOID[language];
      expect(words.length).toBeGreaterThan(0);
      for (const word of words) {
        expect(word).toMatch(gridPattern(language));
        expect([...word].length).toBeGreaterThanOrEqual(avoidData.minLetters);
      }
    }
    for (const id of avoidData.sources) expect(Object.keys(sources.sources)).toContain(id);
  });
});

describe('the page', () => {
  test('draws the grid and the list in the native greys, the list away from the writing hand', () => {
    const game = newWordSearch('P1', 'pt', 'hard', source('pt'));
    for (const hand of ['right', 'left'] as const) {
      const { layout, raster } = drawWordSearchPage(game, { orientation: 'portrait', hand });
      assertNativeGreys(raster);
      expect([raster.width, raster.height]).toEqual([1920, 2560]);
      const panel = layout.sidePanel!;
      expect(hand === 'right' ? panel.x < layout.grid.x : panel.x > layout.grid.x).toBe(true);
    }
  });

  test('is the same whatever the solution: the answer is never drawn', () => {
    const game = newWordSearch('P1', 'en', 'easy', source('en'));
    const moved = { ...game, puzzle: { ...game.puzzle, words: [] } };
    const a = drawWordSearchPage(game, { orientation: 'portrait', hand: 'right' }).raster;
    const b = drawWordSearchPage(moved, { orientation: 'portrait', hand: 'right' }).raster;
    expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels))).toBe(true);
  });
});

describe('checkWordSearch', () => {
  const game = newWordSearch('C1', 'en', 'easy', source('en'));
  const { grid } = wordSearchLayout(game, { orientation: 'portrait', hand: 'right' });
  const size = game.puzzle.size;
  const at = (cell: number, du = 0, dv = 0): InkPoint => {
    const [x, y] = cellCenter(grid, cell % size, Math.floor(cell / size));
    return { x: x + du * grid.cell, y: y + dv * grid.cell };
  };
  const line = (from: InkPoint, to: InkPoint, steps = 30): InkStroke =>
    ({ points: Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps })), element: null });
  const ends = (index: number): [number, number] => {
    const { cells } = game.puzzle.words[index];
    return [cells[0], cells[cells.length - 1]];
  };
  const along = (index: number): [number, number] => {
    const { direction } = game.puzzle.words[index];
    return direction === 'E' ? [1, 0] : [0, 1];
  };

  test('one wrong strike among right ones is the only one marked', () => {
    const [a0, a1] = ends(0);
    const [b0, b1] = ends(1);
    const [du, dv] = along(0);
    // Easy words run across or down only, so a diagonal is never one.
    const diagonal = line(at(0), at(2 * size + 2));
    const strokes = [
      line(at(a0, -0.6 * du, -0.6 * dv), at(a1, 0.6 * du, 0.6 * dv)), // past both ends
      diagonal,
      line(at(b1), at(b0)), // backwards
    ];
    const result = checkWordSearch(game, grid, strokes);
    expect(result.found).toEqual(game.words.filter(w => w === game.puzzle.words[0].word || w === game.puzzle.words[1].word));
    expect(result.wrong).toEqual([{ stroke: 1, cells: [0, size + 1, 2 * size + 2] }]);
    expect(result.missing).toHaveLength(game.words.length - 2);
  });

  test('a strike one letter short of a word is wrong, not found', () => {
    const { cells } = game.puzzle.words[0];
    const result = checkWordSearch(game, grid, [line(at(cells[0]), at(cells[cells.length - 2]))]);
    expect(result.found).toEqual([]);
    expect(result.wrong).toEqual([{ stroke: 0, cells: cells.slice(0, -1) }]);
  });

  test('a bowed stroke, a tick inside one cell and a stroke off the grid are not strikes', () => {
    const bowed: InkStroke = { points: [...line(at(0), at(size + 2)).points, ...line(at(size + 2), at(4)).points], element: null };
    const tick = line(at(0, -0.2, 0), at(0, 0.2, 0));
    const off = line({ x: grid.x - 3 * grid.cell, y: grid.y }, at(3));
    expect(checkWordSearch(game, grid, [bowed, tick, off]).wrong).toEqual([]);
  });

  test('the view pictures ring the wrong strike whole and strike every word, leaving the page as it was', () => {
    const { raster } = drawWordSearchPage(game, { orientation: 'portrait', hand: 'right' });
    const before = Buffer.from(raster.pixels);
    const diagonal = line(at(0), at(2 * size + 2));
    const { wrong } = checkWordSearch(game, grid, [diagonal]);
    const checked = drawWordSearchCheck(raster, grid, [diagonal], wrong);
    const answered = drawWordSearchAnswer(game, raster, grid);
    expect(Buffer.from(raster.pixels).equals(before)).toBe(true);
    for (const picture of [checked, answered]) assertNativeGreys(picture);
    const pixel = (picture: { width: number; pixels: Uint8Array }, p: InkPoint): number => picture.pixels[Math.round(p.y) * picture.width + Math.round(p.x)];
    // The ring passes 0.42 of a cell beyond the strike's first cell, along the strike, so it reads as the whole line.
    const [x0, y0] = cellCenter(grid, 0, 0);
    const beyond = { x: x0 - (0.42 * grid.cell) / Math.SQRT2, y: y0 - (0.42 * grid.cell) / Math.SQRT2 };
    expect(pixel(checked, beyond)).toBeLessThan(pixel(raster, beyond));
    // The answer's line runs between each word's first two letters, where the page has paper.
    for (const { cells } of game.puzzle.words) {
      const [a, b] = [at(cells[0]), at(cells[1])];
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(pixel(answered, middle)).toBe(0);
    }
  });

  test('refuses a grid that is not this puzzle’s', () => {
    expect(() => checkWordSearch(game, { ...grid, columns: size + 1 }, [])).toThrow('square grid');
  });
});
