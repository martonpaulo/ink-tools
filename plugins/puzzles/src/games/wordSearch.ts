/**
 * Word search (#385): a language, then a difficulty, from `@ink-tools/puzzle-core`'s game, page and
 * check of straight strikes. The player strikes each listed word with one straight line; «Check»
 * rings each strike over no word of the list, and the answer strikes every word. Its strings are
 * its own.
 *
 * The languages are the ones puzzle-core bundles a word list for, the default the game declares
 * until My languages (#502) and the language packs (#484) give them.
 * shortcut: English names keyed by the lists' codes, until the adapter gives language names from the platform (#500).
 */
import {
  checkWordSearch,
  drawWordSearchAnswer,
  drawWordSearchCheck,
  drawWordSearchPage,
  newWordSearch,
  WORD_LANGUAGES,
  WORD_SEARCH_GAME_BANDS,
  wordSearchFromCode,
  type WordLanguage,
  type WordSearchBand,
  type WordSearchGame,
  type WordSearchSource,
} from '@ink-tools/puzzle-core';
import {WORD_AVOID, WORD_LISTS} from '@ink-tools/puzzle-core/word-lists';
import {playCopy} from '../play/copy';
import type {PageShape, Puzzle, PuzzleGame} from '../play/puzzle';

export const wordSearchCopy = {
  title: 'Word Search',
  subtitle: 'Find each listed word in the grid and strike it with one straight line',
  language: 'Language',
  languages: {en: 'English', pt: 'Portuguese', es: 'Spanish', de: 'German', fr: 'French'} as Readonly<Record<WordLanguage, string>>,
  wrong: (count: number) => (count === 1 ? '1 strike finds no listed word; it is circled.' : `${count} strikes find no listed word; they are circled.`),
} as const;

const SOURCES = Object.fromEntries(
  WORD_LANGUAGES.map(language => [language, {list: WORD_LISTS[language], avoid: WORD_AVOID[language]}]),
) as Record<WordLanguage, WordSearchSource>;

function board(game: WordSearchGame, shape: PageShape): Puzzle {
  const {raster: page, layout} = drawWordSearchPage(game, {orientation: shape.orientation, hand: shape.hand});
  const {grid} = layout;
  return {
    code: game.code,
    page,
    check: async ink => {
      const found = checkWordSearch(game, grid, ink);
      const solved = found.wrong.length === 0 && found.missing.length === 0;
      return {picture: drawWordSearchCheck(page, grid, ink, found.wrong), wrong: found.wrong.length, unread: 0, solved};
    },
    answer: () => drawWordSearchAnswer(game, page, grid),
  };
}

export const WORD_SEARCH: PuzzleGame = {
  id: 'word-search',
  title: wordSearchCopy.title,
  subtitle: wordSearchCopy.subtitle,
  wrong: wordSearchCopy.wrong,
  options: [
    {
      id: 'language',
      title: wordSearchCopy.language,
      choices: WORD_LANGUAGES.map(value => ({value, label: wordSearchCopy.languages[value]})),
      initial: WORD_LANGUAGES[0],
    },
    {
      id: 'band',
      title: playCopy.difficulty,
      choices: WORD_SEARCH_GAME_BANDS.map(value => ({value, label: playCopy.bands[value]})),
      initial: WORD_SEARCH_GAME_BANDS[0],
    },
  ],
  create: (choices, seed, shape) => {
    const language = choices.language as WordLanguage;
    return board(newWordSearch(seed, language, choices.band as WordSearchBand, SOURCES[language]), shape);
  },
  open: (code, shape) => board(wordSearchFromCode(code, SOURCES), shape),
};
