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
import {checkLookup, LassoPlace, Rect} from '@ink-tools/ink-core';
import {
  DEFAULT_ADAPTERS,
  keepMode,
  keptInMode,
  resolvePhrase,
} from '@ink-tools/picture-search';
import {
  insertText,
  Result,
  TextBoxInput,
  TIMEOUT_CODE,
} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import {missingFor, BUTTONS, Need, permissionProblem} from './buttons';
import {copy, pictureCopy} from './copy';
import {boxRect, FONT_SIZE} from './definition';
import {pickedFor} from './picks';
import {PICTURE_LANGUAGES} from './pictureLanguages';
import {UNPLACED} from './textBox';
import {working} from './working';
import {Mode, modeAdapters} from './modes';
import {findKept, privatePicturesDir, recordKept} from './library';
import {
  createPressGuard,
  deviceAnalyzer,
  deviceContext,
  Done,
  getLookupSettings,
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

/**
 * The measured way in: each prepared picture written to `MyStyle/Lookup/pictures`, a synced
 * folder the note app reads (#142). Used only when an insert from the private folder fails (#23).
 * Every picture inserted, from either folder, is kept in `pictures.json`, so it is reused.
 */
export const LOOKUP_PICTURES: PictureStore = {
  dir: () => picturesDir(),
  options: async () => ({
    width: PICTURE_WIDTH,
    placement: 'below',
    contour: false,
  }),
  find: (result, contour) => findKept(result.id, contour),
  record: recordKept,
  lassoSkipped: () =>
    ToastAndroid.show(copy['picture.unselected'], ToastAndroid.SHORT),
  stickerRefused: () =>
    ToastAndroid.show(copy['sticker.pictureDrawing'], ToastAndroid.SHORT),
};

/** Lookup's pictures in the private folder, which Supernote file sync does not read (#23). */
export function privateStore(pluginDir: string): PictureStore {
  return {...LOOKUP_PICTURES, dir: () => privatePicturesDir(pluginDir)};
}

type InsertArgs = Parameters<typeof insertPicture> extends [
  PictureStore,
  ...infer Rest,
]
  ? Rest
  : never;

/**
 * Inserts from the private folder (#23). Whether the note app takes a PNG from there is not
 * measured yet (docs/supernote.md › Files and sync, #198), so a failed insert is tried once more
 * the measured way, from `MyStyle/Lookup/pictures`, and the log says so. A TIMEOUT is not tried
 * again: the host may still insert it, and a second copy would follow (#33).
 */
export async function insertKept(
  args: InsertArgs,
  folder: () => Promise<Result<string>> = pluginFolder,
  insert: typeof insertPicture = insertPicture,
): Promise<Done<string>> {
  const dir = await folder();
  if (!dir.ok) {
    log(`picture: no private folder (${dir.message}); using MyStyle/Lookup`);
    return insert(LOOKUP_PICTURES, ...args);
  }
  const done = await insert(privateStore(dir.value), ...args);
  if (done.ok || done.step !== 'place' || done.code === TIMEOUT_CODE) {
    return done;
  }
  log(
    `picture: the insert from the private folder failed (${done.message}); inserting from MyStyle/Lookup/pictures`,
  );
  const [result, query, place, contour, options, , stop] = args;
  return insert(
    LOOKUP_PICTURES,
    result,
    query,
    place,
    contour,
    options,
    null,
    stop,
  );
}

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
    picked: pickedFor,
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
  const search = async () =>
    modeSearchSettings(mode, await getLookupSettings());
  return {
    search: (word, _sources, _isNewest, options) =>
      runSearch(
        word,
        sources,
        {
          search: (query, from, {exact, noTimerWait}) =>
            searchCached(query, search, from, undefined, {exact, noTimerWait}),
          thumbs: () => prepareThumbs(),
          picked: pickedFor,
        },
        undefined,
        options,
      ),
    measure: async (results, thumbDir, query, _deps, onThumbs, untilLeader) => {
      const pages = await measureFirst(
        results,
        thumbDir,
        query,
        modeMeasure(mode),
        onThumbs,
        // The insert buttons stop at the leader; the Choose grid waits for every tile (#219).
        untilLeader,
        (result, measures) => keptInMode(result, measures, mode.kind),
      );
      const kept = keepMode(pages.results, pages.measures, mode.kind);
      log(
        `${mode.kind}: ${kept.length} of ${pages.results.length} fit the mode`,
      );
      return {...pages, results: kept};
    },
    insert: async (result, query, place, contour, options, early, stop) =>
      insertKept([
        result,
        query,
        place,
        contour,
        {...(options ?? (await modeOptions())), sticker: mode.sticker},
        early,
        stop,
      ]),
    early: result => startEarlyDownload(result, LOOKUP_PICTURES),
    options: modeOptions,
  };
}

export type PictureDeps = {
  settings: () => Promise<LookupSettings>;
  folder: () => Promise<Result<string>>;
  /** The permissions this mode's press needs and the host has not granted. */
  missing: (mode: Mode) => Promise<readonly Need[]>;
  read: () => Promise<Result<LassoQuery>>;
  /**
   * What a written line searches (#18): the longest trailing word group that is a Wikipedia
   * article, else the last word, chosen by picture-search's `resolvePhrase` in one request. Absent,
   * the whole recognition is searched.
   */
  phrase?: (mode: Mode, line: string) => Promise<Phrase>;
  insert: (
    mode: Mode,
    word: string,
    place: LassoPlace | null,
    limit: InsertLimit,
  ) => Promise<QuickInsert>;
  /** Writes a text box on the current page. */
  write: (box: TextBoxInput) => Promise<Result<boolean>>;
  /** Shows the Needs state of the missing permissions, with «Allow» (#256). */
  needs: (missing: readonly Need[]) => void;
  /** Holds a failure on ui-kit's Error state, which opens the view (#256, #428). */
  fail: (problem: Problem) => void;
};

/** The words of a written line a press searches, and how many of its last words they are. */
export type Phrase = {query: string; words: number};

/**
 * The words of a written line to search (#18), in the mode's search languages: «Quem foi Miguel de
 * Cervantes» searches «Miguel de Cervantes», «Eu comi uma banana» searches «banana». A failed
 * check falls back to the last word inside `resolvePhrase`; a throw keeps the line, never loses it.
 */
export async function phraseOf(
  mode: Mode,
  line: string,
  settings: LookupSettings,
  fetch?: Parameters<typeof deviceContext>[1],
): Promise<Phrase> {
  const whole = {query: line, words: wordsOf(line).length};
  try {
    const ctx = deviceContext(modeSearchSettings(mode, settings), fetch);
    const choice = await resolvePhrase(line, ctx);
    return choice ? {query: choice.query, words: choice.words} : whole;
  } catch (error) {
    log(`phrase: the check failed (${String(error)}); the line is searched`);
    return whole;
  }
}

function wordsOf(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

/**
 * The part of the lasso that holds the line's last `words` words (#18), so the picture goes below
 * them; null when they are the whole line.
 * shortcut: the split is by the share of characters, as recognition gives no word positions;
 * upgrade to the strokes' own gaps when a device round shows it lands under the wrong word.
 */
export function wordsRect(rect: Rect, line: string, words: number): Rect | null {
  const all = wordsOf(line);
  if (words <= 0 || words >= all.length) {
    return null;
  }
  const tail = all.slice(-words).join(' ').length;
  const share = tail / all.join(' ').length;
  const left = Math.round(rect.right - (rect.right - rect.left) * share);
  return {...rect, left};
}

const DEVICE: PictureDeps = {
  settings: getLookupSettings,
  folder: pluginFolder,
  missing: mode =>
    missingFor(BUTTONS.filter(button => button.id === mode.buttonId)),
  read: () => readLassoQuery(),
  phrase: async (mode, line) => phraseOf(mode, line, await getLookupSettings()),
  insert: (mode, word, place, limit) =>
    insertBest(word, place, modeDeps(mode), pictureCopy[mode.kind], limit),
  write: insertText,
  // The view stays open on the Needs state; «Allow» asks while it shows, then closes it (#256).
  needs: missing =>
    working.hold(
      permissionProblem(missing, () => working.dismiss()),
      'needs',
    ),
  fail: problem => working.hold(problem),
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
    const missing = await deps.missing(mode);
    if (missing.length > 0) {
      log(`${name}: missing ${missing.map(need => need.permission).join(', ')}`);
      deps.needs(missing);
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
        deps.fail(UNPLACED);
      } else if (checked.place) {
        await writeNote(deps, checked.place, copy['error.unreadable']);
      }
      return null;
    }
    const line = checked.value.query;
    const place = checked.value.place;
    const phrase = deps.phrase ? await deps.phrase(mode, line) : null;
    const word = phrase?.query ?? line;
    log(
      word === line
        ? `${name}: "${word}"`
        : `${name}: "${line}" searches "${word}"`,
    );
    const words = place && phrase ? wordsRect(place.rect, line, phrase.words) : null;
    // The person stays on the note: the place is read again before the picture is lassoed (#93).
    const at: LassoPlace | null = place
      ? {...place, recheck: true as const, ...(words ? {words} : {})}
      : null;
    const inserted = await deps.insert(mode, word, at, {
      deadline: started + NO_VIEW_LIMIT_MS,
    });
    if (inserted.ok) {
      log(`${name}: done, ${inserted.value}`);
    } else {
      log(`${name}: nothing inserted: ${inserted.text}`);
      if (place) {
        await writeNote(
          deps,
          place,
          copy['picture.failed'](word, inserted.text),
        );
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
