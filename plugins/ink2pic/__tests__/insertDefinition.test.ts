/** «Insert definition» (#115): the text, its box, the failures and the opt-in button. */
import type {DefinitionResult} from '@supernote-tools/ink-core';
import {
  BUTTON_TYPE_LASSO,
  DEFINE_BUTTON_ID,
  SHOW_NO_VIEW,
} from '../src/buttons';
import {
  DEFINITION_FONT_SIZE,
  DefinitionDeps,
  definitionLanguages,
  definitionRect,
  DEFINITION_WIDTH,
  definitionText,
  insertDefinition,
  resetDefinitionButtonForTests,
  SOURCE_LINE,
  syncDefinitionButton,
} from '../src/flow/insertDefinition';
import {defineWithoutView, HeadlessDeps} from '../src/flow/headlessInsert';
import {defaultSettings, Settings} from '../src/settings/settings';
import {copy} from '../src/ui/copy';

const place = {
  rect: {left: 200, top: 300, right: 500, bottom: 400},
  page: 2,
  pageSize: {width: 1920, height: 2560},
};
const settings: Settings = {
  ...defaultSettings(null),
  languages: ['pt', 'en', 'es'],
};
const hit: DefinitionResult = {
  definitions: [
    {text: 'fruto da macieira', partOfSpeech: 'Substantivo'},
    {text: 'parte saliente do rosto', partOfSpeech: 'Substantivo'},
  ],
  providerId: 'wiktionary',
  language: 'pt',
  errors: [],
};

const deps = (more: Partial<DefinitionDeps> = {}): DefinitionDeps => ({
  settings: jest.fn().mockResolvedValue(settings),
  define: jest.fn().mockResolvedValue(hit),
  insert: jest.fn().mockResolvedValue({ok: true, value: true}),
  offline: jest.fn().mockResolvedValue(copy['error.offline']),
  ...more,
});

test('the text: the word with its part of speech, numbered senses, then the source', () => {
  expect(definitionText('maçã', hit)).toBe(
    [
      'maçã (Substantivo)',
      '1. fruto da macieira',
      '2. parte saliente do rosto',
      SOURCE_LINE,
    ].join('\n'),
  );
});

test('only the languages the dictionary knows, in the person’s order', () => {
  expect(definitionLanguages(settings)).toEqual(['pt', 'es']);
  expect(definitionLanguages({...settings, languages: ['en']})).toEqual([]);
});

test('the box sits below the word, 640 px wide, taller for longer text', () => {
  const short = definitionRect('a\nb', place);
  const long = definitionRect(`a\n${'x'.repeat(200)}`, place);
  expect(short).not.toBeNull();
  expect(short!.top).toBeGreaterThan(place.rect.bottom);
  expect(short!.right - short!.left).toBe(640);
  expect(long!.bottom - long!.top).toBeGreaterThan(short!.bottom - short!.top);
});

test('the box keeps its width at the Small picture size, so words do not wrap one per line (#115)', async () => {
  const d = deps({
    settings: jest.fn().mockResolvedValue({...settings, size: 'small'}),
  });
  await insertDefinition('maçã', place, d);
  const box = (d.insert as jest.Mock).mock.calls[0][0];
  expect(box.rect.right - box.rect.left).toBe(DEFINITION_WIDTH);
});

test('a hit is inserted as one text box below the word', async () => {
  const d = deps();
  const result = await insertDefinition('maçã', place, d);
  expect(result).toEqual({ok: true, value: definitionText('maçã', hit)});
  expect(d.define).toHaveBeenCalledWith('maçã', ['pt', 'es']);
  const box = (d.insert as jest.Mock).mock.calls[0][0];
  expect(box.text).toBe(definitionText('maçã', hit));
  expect(box.fontSize).toBe(DEFINITION_FONT_SIZE);
  expect(box.rect.top).toBeGreaterThan(place.rect.bottom);
});

test('a failure on the first language and a hit on the second still inserts', async () => {
  const d = deps({
    define: jest
      .fn()
      .mockResolvedValue({
        ...hit,
        language: 'es',
        errors: ['wiktionary pt: http HTTP 503'],
      }),
  });
  expect((await insertDefinition('manzana', place, d)).ok).toBe(true);
});

test('no definition: the sentence says so; after a failure it is the network sentence', async () => {
  const none = {definitions: [], providerId: null, language: null, errors: []};
  expect(
    await insertDefinition(
      'zzz',
      place,
      deps({define: jest.fn().mockResolvedValue(none)}),
    ),
  ).toEqual({
    ok: false,
    text: copy['definition.none'],
  });
  const failed = deps({
    define: jest
      .fn()
      .mockResolvedValue({...none, errors: ['wiktionary pt: offline']}),
  });
  expect(await insertDefinition('maçã', place, failed)).toEqual({
    ok: false,
    text: copy['error.offline'],
  });
  expect(failed.insert).not.toHaveBeenCalled();
});

test('no dictionary language, no lasso place, or a failed insert each give their sentence', async () => {
  const english = deps({
    settings: jest.fn().mockResolvedValue({...settings, languages: ['en']}),
  });
  expect(await insertDefinition('apple', place, english)).toEqual({
    ok: false,
    text: copy['definition.noLanguage'],
  });
  expect(english.define).not.toHaveBeenCalled();
  expect(await insertDefinition('maçã', null, deps())).toEqual({
    ok: false,
    text: copy['error.place'],
  });
  const refused = deps({
    insert: jest.fn().mockResolvedValue({ok: false, code: 5, message: 'no'}),
  });
  expect(await insertDefinition('maçã', place, refused)).toEqual({
    ok: false,
    text: copy['definition.insertFailed'],
  });
});

describe('the opt-in button', () => {
  const buttons = () => ({
    register: jest.fn().mockResolvedValue({ok: true, value: true}),
    unregister: jest.fn().mockResolvedValue({ok: true, value: true}),
  });
  beforeEach(() => resetDefinitionButtonForTests());

  it('is registered only once the switch is on, and removed when it goes off', async () => {
    const b = buttons();
    await syncDefinitionButton(defaultSettings(null), 'icon.png', b);
    expect(b.register).not.toHaveBeenCalled();
    await syncDefinitionButton({...settings, definition: true}, 'icon.png', b);
    await syncDefinitionButton({...settings, definition: true}, 'icon.png', b);
    expect(b.register).toHaveBeenCalledTimes(1);
    const [type, apps, button] = b.register.mock.calls[0];
    expect([type, apps]).toEqual([BUTTON_TYPE_LASSO, ['NOTE']]);
    expect(button).toMatchObject({
      id: DEFINE_BUTTON_ID,
      name: copy['button.define'],
      showType: SHOW_NO_VIEW,
    });
    await syncDefinitionButton(settings, 'icon.png', b);
    expect(b.unregister).toHaveBeenCalledWith(DEFINE_BUTTON_ID);
  });

  it('a failed registration is tried again on the next change', async () => {
    const b = buttons();
    b.register.mockResolvedValueOnce({
      ok: false,
      code: -1,
      message: 'host busy',
    });
    await syncDefinitionButton({...settings, definition: true}, undefined, b);
    await syncDefinitionButton({...settings, definition: true}, undefined, b);
    expect(b.register).toHaveBeenCalledTimes(2);
  });

  it('a press that arrives after the switch went off does nothing', async () => {
    const headless = {
      read: jest.fn(),
      define: jest.fn(),
    } as unknown as HeadlessDeps;
    await defineWithoutView(
      headless,
      jest.fn().mockResolvedValue(defaultSettings(null)),
    );
    expect(headless.read).not.toHaveBeenCalled();
    expect(headless.define).not.toHaveBeenCalled();
  });
});
