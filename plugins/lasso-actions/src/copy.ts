import {Direction, directionName} from '@ink-tools/ink-core';

/** Every user-facing string of Lookup. English only; never inline in components (#93). */
export const copy = {
  title: 'Lasso Actions',
  /** The module switches (#306). */
  'settings.modules': 'Modules',
  'module.lookup': 'Lookup',
  'module.lookupNote':
    'Lasso a handwritten word and insert a picture, a definition, a summary or a translation for it.',
  'module.headings': 'Headings',
  'module.headingsNote':
    'Lasso a handwritten line and make it a heading of level 1 to 4, across the page.',
  'settings.modes': 'Lasso buttons',
  /** «Heading 1» to «Heading 4» (owner, #304). */
  'button.heading': (level: number) => `Heading ${level}`,
  'permission.heading':
    'Lasso Actions makes the lassoed line a heading in your note.',
  /** Toasts of a Headings press (#252). */
  'heading.noLasso': 'Lasso a handwritten line first, then press a heading.',
  'heading.failed': 'The heading could not be made.',
  'heading.notMoved':
    'The heading was made, but it could not be moved to the margin.',
  'button.define': 'Insert Definition',
  /** A 3-sentence bio or topic summary from Wikipedia (#114). */
  'button.summary': 'Insert Summary',
  'permission.summary':
    'Lasso Actions reads a short summary of the word from Wikipedia.',
  /** Written on the note below the word: a term with no article is never guessed (#114). */
  'summary.none': (word: string) => `${word}: no summary found`,
  'summary.failed': (word: string) => `${word}: Wikipedia could not be reached`,
  'summary.insert': 'The summary could not be inserted on the page.',
  /** The box's last line: Wikipedia's text is CC BY-SA, so it names its source. */
  'summary.source': '(Wikipedia)',
  /** One button per direction (#174): «Translate ES→PT». */
  'button.translate': (direction: Direction) =>
    `Translate ${directionName(direction)}`,
  'settings.translate': 'Translation buttons',
  /** The picture options left in Settings (owner's presets, #105). */
  'settings.sources': 'Picture sources',
  'settings.dataSaver': 'Data saver',
  'settings.dataSaverHint': 'Fewer and smaller pictures per search.',
  /** Where the inserted pictures are kept, and why (#23, owner D13 B). */
  'settings.pictures': 'Saved pictures',
  'settings.picturesHint':
    'Lasso Actions keeps each picture it inserted in its own plugin folder, so it can insert it again without a download. Supernote file sync does not read that folder: each file in a synced folder adds about 0.14 s to every file sync.',
  /** Files earlier versions left in synced folders, with the way out (#23). */
  'settings.oldFiles': (
    folders: readonly {folder: string; files: number | null}[],
  ) =>
    `Earlier versions left files in synced folders: ${folders
      .map(({folder, files}) =>
        files === null
          ? `${folder} (cannot be read)`
          : `${folder} (${files} files)`,
      )
      .join(
        ', ',
      )}. Each file adds about 0.14 s to every Supernote file sync. Delete these folders with the File Manager.`,
  'source.openclipart': 'Openclipart',
  'source.commons': 'Wikimedia Commons',
  'source.wikidata': 'Wikidata',
  'source.openmoji': 'OpenMoji',
  'permission.internet':
    'Lasso Actions looks words up in an online dictionary, Wiktionary.',
  'permission.translate':
    'Lasso Actions translates words with online dictionaries, Wiktionary and Apertium.',
  'permission.files': 'Lasso Actions reads the word you lasso on the page.',
  'permission.write': 'Lasso Actions puts each picture in your note.',
  'permission.pictures':
    'Lasso Actions searches Wikimedia Commons, Openclipart and OpenMoji for the word you lasso.',
  /** Written on the note below the word: a word with no definition is never guessed (#115). */
  'definition.none': (word: string) => `${word}: no definition found`,
  'definition.failed': (word: string) =>
    `${word}: the dictionary could not be reached`,
  /** Written on the note below the word when a picture press inserts nothing (#111). */
  'picture.failed': (word: string, why: string) => `${word}: ${why}`,
  'error.place': 'There is no room below the lassoed word.',
  /** Written on the note below the selection: no word was recognized in it (#166). */
  'error.unreadable': 'The handwriting could not be read.',
  /** A toast: a pasted selection has no place on the page yet (#165). */
  'error.unplaced':
    'Put the selection down on the page first, then press again.',
  'error.insert': 'The definition could not be inserted on the page.',
  /** Toasts that replace the «Loading…» strip (#103). */
  'working.failed': 'Lasso Actions stopped with an error.',
  'working.timeout': 'Lasso Actions is still working.',
  /** A toast after an insert that touches other ink, which a lasso would take with it (#168). */
  'picture.unselected':
    'The picture touches your writing, so it is not selected.',
  /** Written on the note below the word: a word with no translation is never guessed (#158). */
  'translation.none': (word: string) => `${word}: no translation found`,
  'translation.failed': (word: string) =>
    `${word}: the dictionaries could not be reached`,
  'translation.insert': 'The translation could not be inserted on the page.',
  /** «Choose Image»'s screen (#156). */
  'choose.title': (word: string) => `Pictures for «${word}»`,
  'choose.illustration': 'Illustrations',
  'choose.photo': 'Photos',
  'choose.more': 'More',
  'choose.inserting': 'Putting the picture in your note.',
  'choose.tile': (title: string, source: string) => `${title}, from ${source}`,
  'choose.noWord': 'Lasso a handwritten word first, then press Choose Image.',
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
    'Lasso Actions needs Network Access to search pictures.',
  'error.permission.files':
    'Lasso Actions needs Read Files and Modify Files to save pictures.',
  'error.permission.settings':
    'To allow it, open Settings > Apps > Plugins > Lasso Actions > Permissions.',
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
