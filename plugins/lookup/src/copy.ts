/** Every user-facing string of Lookup. English only; never inline in components (#93). */
export const copy = {
  title: 'Lookup',
  'settings.modes': 'Lasso buttons',
  'button.define': 'Insert definition',
  'permission.internet': 'Lookup looks words up in an online dictionary, Wiktionary.',
  'permission.files': 'Lookup reads the word you lasso on the page.',
  /** Written on the note below the word: a word with no definition is never guessed (#115). */
  'definition.none': (word: string) => `${word}: no definition found`,
  'definition.failed': (word: string) =>
    `${word}: the dictionary could not be reached`,
  'error.place': 'There is no room below the lassoed word.',
  'error.insert': 'The definition could not be inserted on the page.',
} as const;
