/** Every user-facing string of Lingo. English only; never inline in components (#93). */
export const copy = {
  title: 'Lingo',
  'settings.pairs': 'Language pairs',
  'language.pt': 'Portuguese',
  'language.es': 'Spanish',
  'language.zh': 'Chinese',
  'permission.internet':
    'Lingo looks words up in online dictionaries, Wiktionary and Apertium.',
  /** Written on the note beside the word: a word with no translation is never guessed (#128). */
  'translate.none': (direction: string, word: string) =>
    `${word}: no ${direction} translation found`,
  'translate.failed': (word: string) =>
    `${word}: the dictionaries could not be reached`,
  'error.place': 'There is no room beside the lassoed word.',
  'error.insert': 'The translation could not be inserted on the page.',
} as const;
