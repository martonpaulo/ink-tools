/**
 * «Insert definition» (#115): the lassoed word's monolingual definition, from the shared
 * `DictionaryProvider` chain of ink-core in the person's query languages, inserted as a text box
 * below the word. The lookup mode of docs/plugin-scope.md › lookup, shipped in Ink2Pic until
 * `lookup` exists (#45). Opt in: the lasso button exists only while its Settings switch is on.
 *
 * Feature code never names a source: `definers()` is the one place the chain is built. The text
 * box fields and a button registered after start-up are TO TEST on the device (brief section 10.5).
 */
import {
  defineFirst,
  DefinitionResult,
  DictionaryProvider,
  isLanguage,
  LanguageCode,
  placeRect,
  Rect,
  wiktionaryDefiner,
} from '@supernote-tools/ink-core';
import {
  BUTTON_TYPE_LASSO,
  DEFINE_BUTTON_ID,
  EDIT_DATA_STROKES,
  SHOW_NO_VIEW,
} from '../buttons';
import {USER_AGENT} from '../config';
import {log, logged, timed} from '../log/memory';
import {createFetcher} from '../search-core';
import {Settings, SIZE_WIDTHS} from '../settings/settings';
import {getSettings} from '../storage/settings';
import {copy} from '../ui/copy';
import {offlineText} from './failure';
import type {LassoPlace} from './place';
import type {InsertLimit, QuickInsert} from './quickInsert';
import {
  insertText,
  registerButton,
  Result,
  TextBoxInput,
  unregisterButton,
} from '@supernote-tools/sn-adapter/official';

/** The text size in page pixels [INFERENCE: near the Supernote's own text box default]. */
export const DEFINITION_FONT_SIZE = 32;
/** One line's height in page pixels, for the box's height. */
const LINE_HEIGHT = Math.round(DEFINITION_FONT_SIZE * 1.5);
/** About how wide one character is, as a share of the font size [INFERENCE]. */
const CHAR_WIDTH = 0.55;
/** The source line the text box ends with: Wiktionary's text is CC BY-SA. */
export const SOURCE_LINE = '(Wiktionary)';

/** The dictionary chain: offline first once #46 builds one, then Wiktionary. */
export function definers(): DictionaryProvider[] {
  const fetcher = createFetcher({
    fetch: globalThis.fetch,
    userAgent: USER_AGENT,
    log,
    retryDelayMs: 0, // no timer: the press runs with no view (#93)
  });
  return [
    wiktionaryDefiner(async url => {
      const answer = await fetcher(url);
      if (!answer.ok) {
        throw new Error(`${answer.kind} ${answer.message}`);
      }
      return answer.value;
    }),
  ];
}

/** The query languages the dictionary knows, in the person's order. */
export function definitionLanguages(settings: Settings): LanguageCode[] {
  return settings.languages.filter((code): code is LanguageCode =>
    isLanguage(code),
  );
}

/** The text box's text: the word and its part of speech, the numbered senses, the source. */
export function definitionText(word: string, result: DefinitionResult): string {
  const speech = result.definitions[0]?.partOfSpeech;
  const head = speech ? `${word} (${speech})` : word;
  const senses = result.definitions.map(
    (sense, index) => `${index + 1}. ${sense.text}`,
  );
  return [head, ...senses, SOURCE_LINE].join('\n');
}

/** The box below the lassoed word, as wide as the picture size, as tall as its wrapped lines. */
export function definitionRect(
  text: string,
  place: LassoPlace,
  settings: Settings,
): Rect | null {
  const width = SIZE_WIDTHS[settings.size];
  const perLine = Math.max(
    1,
    Math.floor(width / (DEFINITION_FONT_SIZE * CHAR_WIDTH)),
  );
  const lines = text
    .split('\n')
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)),
      0,
    );
  return placeRect(
    place.rect,
    {width, height: lines * LINE_HEIGHT},
    place.pageSize,
    'below',
  );
}

export type DefinitionDeps = {
  settings: () => Promise<Settings>;
  define: (
    word: string,
    languages: readonly LanguageCode[],
  ) => Promise<DefinitionResult>;
  insert: (box: TextBoxInput) => Promise<Result<boolean>>;
  offline: () => Promise<string>;
};

const DEVICE: DefinitionDeps = {
  settings: getSettings,
  define: (word, languages) => defineFirst(definers(), word, languages),
  insert: insertText,
  offline: offlineText,
};

/** Defines `word` and inserts it below `place`; the value is the inserted text. */
export async function insertDefinition(
  word: string,
  place: LassoPlace | null,
  deps: DefinitionDeps = DEVICE,
  {deadline}: InsertLimit = {},
): Promise<QuickInsert> {
  const settings = await deps.settings();
  const languages = definitionLanguages(settings);
  if (languages.length === 0) {
    log('insert definition: no query language has a dictionary');
    return {ok: false, text: copy['definition.noLanguage']};
  }
  if (!place) {
    return {ok: false, text: copy['error.place']};
  }
  const result = await timed('define', () => deps.define(word, languages));
  result.errors.forEach(error => log(`insert definition: ${error}`));
  if (result.definitions.length === 0) {
    log(`insert definition: none for "${word}" in ${languages.join(', ')}`);
    return {
      ok: false,
      text:
        result.errors.length > 0
          ? await deps.offline()
          : copy['definition.none'],
    };
  }
  log(
    `insert definition: ${result.definitions.length} from ${result.providerId} ${result.language}`,
  );
  if (deadline !== undefined && Date.now() > deadline) {
    log('insert definition: the limit passed before the insert');
    return {ok: false, text: copy['error.sourcesDown']};
  }
  const text = definitionText(word, result);
  const rect = definitionRect(text, place, settings);
  if (!rect) {
    return {ok: false, text: copy['error.place']};
  }
  const inserted = await logged(`insertText(${JSON.stringify(rect)})`, () =>
    deps.insert({text, rect, fontSize: DEFINITION_FONT_SIZE}),
  );
  if (!inserted.ok) {
    return {ok: false, text: copy['definition.insertFailed']};
  }
  return {ok: true, value: text};
}

export type ButtonDeps = {
  register: typeof registerButton;
  unregister: typeof unregisterButton;
};

const BUTTONS: ButtonDeps = {
  register: registerButton,
  unregister: unregisterButton,
};

/** Whether the host holds the button now, as this runtime registered it. */
let registered = false;

/**
 * Registers the «Insert definition» button while the switch is on and removes it once it is off,
 * so the lasso menu shows the mode only when the person asked for it. A failed call is logged and
 * leaves the state as it was, so the next change tries again.
 */
export async function syncDefinitionButton(
  settings: Settings,
  icon: string | undefined,
  deps: ButtonDeps = BUTTONS,
): Promise<void> {
  if (settings.definition === registered) {
    return;
  }
  const result = settings.definition
    ? await logged('registerButton(definition)', () =>
        deps.register(BUTTON_TYPE_LASSO, ['NOTE'], {
          id: DEFINE_BUTTON_ID,
          name: copy['button.define'],
          ...(icon ? {icon} : {}),
          editDataTypes: [EDIT_DATA_STROKES],
          showType: SHOW_NO_VIEW,
        }),
      )
    : await logged('unregisterButton(definition)', () =>
        deps.unregister(DEFINE_BUTTON_ID),
      );
  if (result.ok) {
    registered = settings.definition;
  }
}

/** The icon the start-up registration passes, kept for a later registration from Settings. */
let buttonIcon: string | undefined;

export function setDefinitionIcon(icon: string): void {
  buttonIcon = icon;
}

/** The Settings path: the same sync with the icon index.js gave. */
export function definitionSwitched(settings: Settings): Promise<void> {
  return syncDefinitionButton(settings, buttonIcon);
}

export function resetDefinitionButtonForTests(): void {
  registered = false;
  buttonIcon = undefined;
}
