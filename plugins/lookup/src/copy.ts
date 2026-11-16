/** Every user-facing string of Lookup. English only; never inline in components (#93). */
export const copy = {
  title: 'Lookup',
  'settings.modes': 'Lasso buttons',
  'button.define': 'Insert definition',
  'permission.internet':
    'Lookup looks words up in an online dictionary, Wiktionary.',
  'permission.files': 'Lookup reads the word you lasso on the page.',
  'permission.write':
    'Lookup saves each picture to MyStyle/Lookup before it puts it in your note.',
  'permission.pictures':
    'Lookup searches Wikimedia Commons, Openclipart and OpenMoji for the word you lasso.',
  /** Written on the note below the word: a word with no definition is never guessed (#115). */
  'definition.none': (word: string) => `${word}: no definition found`,
  'definition.failed': (word: string) =>
    `${word}: the dictionary could not be reached`,
  /** Written on the note below the word when a picture press inserts nothing (#111). */
  'picture.failed': (word: string, why: string) => `${word}: ${why}`,
  'error.place': 'There is no room below the lassoed word.',
  'error.insert': 'The definition could not be inserted on the page.',
  /** «Choose picture»'s screen (#156). */
  'choose.title': (word: string) => `Pictures for «${word}»`,
  'choose.illustration': 'Illustrations',
  'choose.photo': 'Photos',
  'choose.close': 'Close',
  'choose.more': 'More',
  'choose.inserting': 'Putting the picture in your note.',
  'choose.tile': (title: string, source: string) => `${title}, from ${source}`,
  'choose.noWord': 'Lasso a handwritten word first, then press Choose picture.',
} as const;

/**
 * The sentences a picture press can end with (#111, #142): the keys picture-search's insert tier
 * names, each written on the note below the word. `search.empty` is the mode's own.
 */
const pictureFailures = {
  'search.running': 'Searching.',
  'search.corrected': 'Showing results for {query}.',
  'search.stale': 'The sources did not answer. An earlier search was used.',
  'error.sourceDown': 'A picture source did not answer.',
  'error.offline': 'no internet connection.',
  'error.sourcesDown':
    'the picture sources did not answer. Try again in a minute.',
  'error.permission.internet':
    'Lookup needs Network Access to search pictures.',
  'error.permission.files':
    'Lookup needs Read Files and Modify Files to save pictures.',
  'error.permission.settings':
    'To allow it, open Settings > Apps > Plugins > Lookup > Permissions.',
  'error.save':
    'the picture could not be saved. Free some space and try again.',
  'error.downloadOffline':
    'the internet stopped while getting the picture. Try again when you are online.',
  'error.download': 'the picture could not be downloaded. Try again.',
  'error.emptyLasso': 'there is no handwriting in the lasso.',
  'error.recognition': 'the word could not be read.',
  'error.placeSlow':
    'the picture may still appear. Check the page before you try again.',
  'error.place': 'the picture could not be put in the note.',
  'error.unexpected': 'something went wrong. Try again.',
} as const;

export const pictureCopy = {
  illustration: {...pictureFailures, 'search.empty': 'no illustration found.'},
  photo: {...pictureFailures, 'search.empty': 'no photo found.'},
} as const;
