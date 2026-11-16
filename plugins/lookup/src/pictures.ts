/**
 * «Insert illustration» and «Insert photo» (#111): one lasso button per picture mode, each a
 * no-view press that runs picture-search's «Insert best picture» flow (#74, shared by #142) with
 * the mode's sources and style, keeps only the mode's measured tiles (`keepMode`), and inserts the
 * first at the lasso, below the word. A press that inserts nothing writes its sentence on the note
 * below the word, as «Insert definition» does (#115): never a drawing for a photo, never a guess.
 *
 * One press runs at a time across both buttons (the shared press guard, #93). A missing permission
 * opens Lookup's view, which asks for it (App.tsx).
 */
import {ToastAndroid} from 'react-native';
import {checkLookup, LassoPlace} from '@supernote-tools/ink-core';
import {
  DEFAULT_ADAPTERS,
  keepMode,
  keptInMode,
} from '@supernote-tools/picture-search';
import {
  insertText,
  Result,
  TextBoxInput,
} from '@supernote-tools/sn-adapter/official';
import {missingFor, BUTTONS} from './buttons';
import {copy, pictureCopy} from './copy';
import {boxRect, FONT_SIZE} from './definition';
import {PICTURE_LANGUAGES} from './pictureLanguages';
import {showToast} from './textBox';
import {showOwnView} from './working';
import {Mode, modeAdapters} from './modes';
import {
  createPressGuard,
  deviceAnalyzer,
  getSettings,
  insertBest,
  insertPicture,
  InsertLimit,
  LassoQuery,
  log,
  logged,
  MEASURE_LIMIT_MS,
  measureFirstPages,
  MeasureDeps,
  NO_VIEW_LIMIT_MS,
  picturesDir,
  PictureStore,
  pluginFolder,
  prepareThumbs,
  QuickInsert,
  QuickInsertDeps,
  readLassoQuery,
  runSearch,
  searchCached,
  SearchSettings,
  startEarlyDownload,
  thumbUri,
  wordKeptOptions,
} from './profile';
import {LookupSettings, sourceOn} from './settings';

/**
 * The one picture size, fixed with no choice (owner's preset, #105): Ink2Pic's «small», 200 px
 * (#33). The place stays below the word; the style is the button's mode (#111).
 */
export const PICTURE_WIDTH = 200;

/** Where Lookup writes each prepared picture; no library, no symbols (D40 B, #142). */
export const LOOKUP_PICTURES: PictureStore = {
  dir: () => picturesDir(),
  options: async () => ({
    width: PICTURE_WIDTH,
    placement: 'below',
    contour: false,
  }),
  lassoSkipped: () =>
    ToastAndroid.show(copy['picture.unselected'], ToastAndroid.SHORT),
};

export {PICTURE_LANGUAGES};

/**
 * What the mode's search reads: PICTURE_LANGUAGES, the mode's style, the person's data saver and
 * the sources left on in Settings (#105), among the mode's own (`modeAdapters`).
 */
export function modeSearchSettings(
  mode: Mode,
  settings: LookupSettings,
): SearchSettings {
  return {
    languages: PICTURE_LANGUAGES,
    photos: mode.photos,
    dataSaver: settings.dataSaver,
    sourceOn: name => sourceOn(settings, name),
  };
}

function modeMeasure(mode: Mode): MeasureDeps {
  return {
    analyzer: deviceAnalyzer,
    thumb: (result, dir) => thumbUri(result, dir),
    limitMs: MEASURE_LIMIT_MS,
    allContour: async () => false,
    photos: async () => mode.photos,
  };
}

/**
 * The shared flow bound to one mode. `keepMode` keeps only the mode's measured tiles, so the
 * first one left is the mode's best, and a photo list with no photo is empty, never a drawing.
 * The measure stops once that first tile is fixed whatever the pending tiles measure (#19, owner
 * D48 A): «Insert Sticker» waited 2.4 s for every tile of pages 1 and 2 on the tablet.
 */
export function modeDeps(
  mode: Mode,
  measureFirst: typeof measureFirstPages = measureFirstPages,
): QuickInsertDeps {
  const sources = modeAdapters(mode, DEFAULT_ADAPTERS);
  // «Insert Sticker» pastes a sticker, «Insert Image» a picture (#35).
  const modeOptions = async () => ({
    ...(await wordKeptOptions(LOOKUP_PICTURES)),
    sticker: mode.sticker,
  });
  const search = async () => modeSearchSettings(mode, await getSettings());
  return {
    search: (word, _sources, _isNewest, options) =>
      runSearch(
        word,
        sources,
        {
          search: (query, from, {exact, noTimerWait}) =>
            searchCached(query, search, from, undefined, {exact, noTimerWait}),
          thumbs: () => prepareThumbs(),
        },
        undefined,
        options,
      ),
    measure: async (results, thumbDir, query, _deps, onThumbs) => {
      const pages = await measureFirst(
        results,
        thumbDir,
        query,
        modeMeasure(mode),
        onThumbs,
        true,
        (result, measures) => keptInMode(result, measures, mode.kind),
      );
      const kept = keepMode(pages.results, pages.measures, mode.kind);
      log(
        `${mode.kind}: ${kept.length} of ${pages.results.length} fit the mode`,
      );
      return {...pages, results: kept};
    },
    insert: async (result, query, place, contour, options, early, stop) =>
      insertPicture(
        LOOKUP_PICTURES,
        result,
        query,
        place,
        contour,
        {...(options ?? (await modeOptions())), sticker: mode.sticker},
        early,
        stop,
      ),
    early: result => startEarlyDownload(result, LOOKUP_PICTURES),
    options: modeOptions,
  };
}

export type PictureDeps = {
  settings: () => Promise<LookupSettings>;
  folder: () => Promise<Result<string>>;
  /** The permissions this mode's press needs and the host has not granted. */
  missing: (mode: Mode) => Promise<readonly unknown[]>;
  read: () => Promise<Result<LassoQuery>>;
  insert: (
    mode: Mode,
    word: string,
    place: LassoPlace | null,
    limit: InsertLimit,
  ) => Promise<QuickInsert>;
  /** Writes a text box on the current page. */
  write: (box: TextBoxInput) => Promise<Result<boolean>>;
  show: () => Promise<Result<boolean>>;
  /** The device toast when absent. */
  toast?: (text: string) => void;
};

const DEVICE: PictureDeps = {
  settings: getSettings,
  folder: pluginFolder,
  missing: mode =>
    missingFor(BUTTONS.filter(button => button.id === mode.buttonId)),
  read: () => readLassoQuery(),
  insert: (mode, word, place, limit) =>
    insertBest(word, place, modeDeps(mode), pictureCopy[mode.kind], limit),
  write: insertText,
  // The view stays open for Settings, which asks for the permission, so the strip hands it over.
  show: showOwnView,
};

/** One press at a time across both picture buttons (#93). */
const guard = createPressGuard(NO_VIEW_LIMIT_MS);

/** Why a press inserted nothing, written below the word; logged when there is no room. */
async function writeNote(
  deps: PictureDeps,
  place: LassoPlace,
  text: string,
): Promise<void> {
  const rect = boxRect(text, place);
  if (!rect) {
    log('picture: no room below the lasso for the sentence');
    return;
  }
  const written = await logged('insertText (picture failure)', () =>
    deps.write({text, rect, fontSize: FONT_SIZE}),
  );
  if (written.ok && written.value !== true) {
    log('insertText answered false: the sentence is not on the page');
  }
}

/**
 * One press of a picture mode's button with no view; the value is the insert's answer, or null
 * when the press did not run (another press runs, the switch is off, a permission is missing, or
 * the lasso could not be read). Never rejects.
 */
export async function pictureLasso(
  mode: Mode,
  deps: PictureDeps = DEVICE,
): Promise<QuickInsert | null> {
  const name = `${mode.name} (no view)`;
  const started = Date.now();
  const turn = guard.take(started);
  if (!turn) {
    log(`${name}: already running, press ignored`);
    return null;
  }
  try {
    log(`${name}: start`);
    if (turn.replacedAfter !== null) {
      log(
        `${name}: the last press is still running after ${turn.replacedAfter} ms; starting again`,
      );
    }
    if (!(await deps.settings())[mode.settingKey]) {
      log(`${name}: the switch is off, press ignored`);
      return null;
    }
    await deps.folder();
    if ((await deps.missing(mode)).length > 0) {
      log(`${name}: a permission is missing, opening the view`);
      await logged('showPluginView', deps.show);
      return null;
    }
    const query = await deps.read();
    if (!query.ok) {
      log(`${name}: no word, ${query.code} ${query.message}`);
      return null;
    }
    // A pasted selection's rect or a recognition with no word stops before the search (#165, #166).
    const checked = checkLookup(query.value);
    if (!checked.ok) {
      log(`${name}: ${checked.why}, ${checked.message}`);
      if (checked.why === 'unplaced') {
        (deps.toast ?? showToast)(copy['error.unplaced']);
      } else if (checked.place) {
        await writeNote(deps, checked.place, copy['error.unreadable']);
      }
      return null;
    }
    const word = checked.value.query;
    const place = checked.value.place;
    log(`${name}: "${word}"`);
    // The person stays on the note: the place is read again before the picture is lassoed (#93).
    const at: LassoPlace | null = place
      ? {...place, recheck: true as const}
      : null;
    const inserted = await deps.insert(mode, word, at, {
      deadline: started + NO_VIEW_LIMIT_MS,
    });
    if (inserted.ok) {
      log(`${name}: done, ${inserted.value}`);
    } else {
      log(`${name}: nothing inserted: ${inserted.text}`);
      if (place) {
        await writeNote(deps, place, copy['picture.failed'](word, inserted.text));
      }
    }
    return inserted;
  } catch (error) {
    log(`${name} failed: ${String(error)}`);
    return {ok: false, text: pictureCopy[mode.kind]['error.unexpected']};
  } finally {
    turn.end();
  }
}
