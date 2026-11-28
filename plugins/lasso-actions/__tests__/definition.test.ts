/** «Insert definition» in Lookup (#115): the text, its box, the failures and the opt-in button. */
import {DefinitionResult, LassoPlace, PAGE_BAR_PX} from '@ink-tools/ink-core';
import {ok} from '@ink-tools/sn-adapter/official';
import {
  BOX_WIDTH,
  boxRect,
  DEFINE_BUTTON_ID,
  DefineDeps,
  defineLasso,
  definitionText,
  FONT_SIZE,
  LANGUAGES,
} from '../src/definition';
import {
  BUTTON_TYPE_LASSO,
  ButtonDeps,
  resetButtonsForTests,
  settingsChanged,
  SHOW_NO_VIEW,
} from '../src/buttons';
import {iconUri} from '../src/icons';
import {FIRST_BUTTON_ID, MODES} from '../src/modes';
import {copy} from '../src/copy';
import {UNDER_BAR, UNPLACED} from '../src/textBox';
import {defaultSettings} from '../src/settings';

const place: LassoPlace = {
  rect: {left: 372, top: 300, right: 572, bottom: 380},
  page: 0,
  pageSize: {width: 1920, height: 2560},
};

const found: DefinitionResult = {
  definitions: [
    {text: 'o fruto comestível da macieira', partOfSpeech: 'Substantivo'},
  ],
  providerId: 'wiktionary',
  language: 'pt',
  errors: [],
};

function deps(over: Partial<DefineDeps> = {}): DefineDeps & {lines: string[]} {
  const lines: string[] = [];
  return {
    read: async () => ({ok: true, value: {query: 'maçã', place}}),
    define: async () => found,
    insert: jest.fn(async () => ok(true)),
    log: line => lines.push(line),
    fail: jest.fn(),
    now: () => 0,
    lines,
    ...over,
  };
}

test('the text: the word, its part of speech, the numbered senses and the source', () => {
  expect(definitionText('maçã', found)).toBe(
    'maçã (Substantivo)\n1. o fruto comestível da macieira\n(Wiktionary)',
  );
});

test('the box is 640 px wide, below the word, never over it (#115)', () => {
  const rect = boxRect(definitionText('maçã', found), place);
  expect(rect).not.toBeNull();
  expect(rect!.right - rect!.left).toBe(BOX_WIDTH);
  expect(BOX_WIDTH).toBe(640);
  expect(rect!.top).toBeGreaterThan(place.rect.bottom);
  expect(rect!.left).toBe(place.rect.left);
});

test('the box goes past a written line under the word, into free space (#152)', () => {
  const below = place.rect.bottom + 24;
  const line = {left: 0, top: below + 5, right: 1900, bottom: below + 80};
  const rect = boxRect(definitionText('maçã', found), {
    ...place,
    occupied: [line],
  });
  expect(rect!.top).toBe(line.bottom + 24);
});

test('the box never reaches the note\'s page bar, for a word anywhere down the page (#577)', () => {
  for (const top of [300, 1500, 2300, 2380, 2500]) {
    const low = {...place, rect: {left: 372, top, right: 572, bottom: top + 80}};
    const rect = boxRect(definitionText('maçã', found), low);
    if (rect) {
      expect(rect.bottom).toBeLessThanOrEqual(place.pageSize.height - PAGE_BAR_PX);
    }
  }
});

test('a press inserts the definition below the lasso and logs each step', async () => {
  const d = deps();
  const asked: string[][] = [];
  d.define = async (word, languages) => {
    asked.push([word, ...languages]);
    return found;
  };
  expect(await defineLasso(d)).toEqual({
    ok: true,
    text: definitionText('maçã', found),
  });
  expect(asked).toEqual([['maçã', ...LANGUAGES]]);
  expect(d.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      text: definitionText('maçã', found),
      fontSize: FONT_SIZE,
    }),
  );
  expect(d.lines.join('\n')).toMatch(/define: 1 from wiktionary pt/);
  expect(d.lines.join('\n')).toMatch(/total \d+ ms/);
});

test('no definition: a sentence says so on the note, never a guess', async () => {
  const d = deps({
    define: async () => ({
      definitions: [],
      providerId: null,
      language: null,
      errors: [],
    }),
  });
  expect(await defineLasso(d)).toEqual({
    ok: false,
    text: copy['definition.none']('maçã'),
  });
  expect(d.insert).toHaveBeenCalledWith(
    expect.objectContaining({text: 'maçã: no definition found'}),
  );
});

test('a dictionary that cannot be reached says so, not «no definition»', async () => {
  const d = deps({
    define: async () => ({
      definitions: [],
      providerId: null,
      language: null,
      errors: ['wiktionary pt: network'],
    }),
  });
  expect((await defineLasso(d)).text).toBe(copy['definition.failed']('maçã'));
});

test('a failed lasso read inserts nothing', async () => {
  const d = deps({
    read: async () => ({
      ok: false,
      code: 1503,
      message: 'File read permission has not been requested',
    }),
  });
  expect((await defineLasso(d)).ok).toBe(false);
  expect(d.insert).not.toHaveBeenCalled();
  expect(d.lines[0]).toMatch(/lasso failed: 1503/);
});

test('the button id follows the picture modes, so no Lookup id is shared', () => {
  expect(DEFINE_BUTTON_ID).toBe(FIRST_BUTTON_ID + MODES.length);
  expect(MODES.map(mode => mode.buttonId)).not.toContain(DEFINE_BUTTON_ID);
});

describe('the opt-in button', () => {
  beforeEach(resetButtonsForTests);

  function buttonDeps(granted: boolean): ButtonDeps & {lines: string[]} {
    const lines: string[] = [];
    return {
      register: jest.fn(async () => ok(true as const)),
      unregister: jest.fn(async () => ok(true as const)),
      hasPermission: jest.fn(async () => ok(granted)),
      requestPermission: jest.fn(async () => ok(2)),
      log: line => lines.push(line),
      lines,
    };
  }

  test('on registers a no-view lasso button and asks for each missing permission', async () => {
    const d = buttonDeps(false);
    await settingsChanged(
      {
        ...defaultSettings,
        definition: true,
        illustration: false,
        photo: false,
        choose: false,
      },
      d,
    );
    expect(d.register).toHaveBeenCalledWith(BUTTON_TYPE_LASSO, ['NOTE'], {
      id: DEFINE_BUTTON_ID,
      name: 'Insert Definition',
      icon: iconUri('definition.png'),
      editDataTypes: [0],
      showType: SHOW_NO_VIEW,
    });
    expect(d.requestPermission).toHaveBeenCalledTimes(2);
  });

  test('off removes it once, and asks nothing', async () => {
    const d = buttonDeps(true);
    await settingsChanged(
      {
        ...defaultSettings,
        definition: true,
        illustration: false,
        photo: false,
        choose: false,
      },
      d,
    );
    await settingsChanged(
      {
        ...defaultSettings,
        definition: false,
        illustration: false,
        photo: false,
        choose: false,
      },
      d,
    );
    await settingsChanged(
      {
        ...defaultSettings,
        definition: false,
        illustration: false,
        photo: false,
        choose: false,
      },
      d,
    );
    expect(d.unregister).toHaveBeenCalledTimes(1);
    expect(d.requestPermission).not.toHaveBeenCalled();
  });
});

describe('a read it may not use stops before the dictionary (#165, #166)', () => {
  test('a recognition with no letter writes that the handwriting could not be read', async () => {
    const define = jest.fn(async () => found);
    const d = deps({
      read: async () => ({ok: true, value: {query: '• :.\n÷\n÷:.\n.\n.', place}}),
      define,
    });
    expect(await defineLasso(d)).toEqual({ok: false, text: copy['error.unreadable']});
    expect(define).not.toHaveBeenCalled();
    expect((d.insert as jest.Mock).mock.calls[0][0].text).toBe(copy['error.unreadable']);
  });

  test('a word under the page bar writes nothing and says so, not that the selection has no place (#577)', async () => {
    const low = {...place, rect: {left: 372, top: 2460, right: 572, bottom: 2532}};
    const d = deps({read: async () => ({ok: true, value: {query: 'maçã', place: low}})});
    expect(await defineLasso(d)).toEqual({ok: false, text: copy['error.underBar']});
    expect(d.insert).not.toHaveBeenCalled();
    expect(d.fail).toHaveBeenCalledWith(UNDER_BAR);
    expect(copy['error.underBarWhat']).toMatch(/page bar/);
  });

  test("a pasted selection's local rect writes nothing and holds the Error state (#428)", async () => {
    const pasted = {...place, rect: {left: -40, top: 0, right: 140, bottom: 181}};
    const d = deps({read: async () => ({ok: true, value: {query: 'maçã', place: pasted}})});
    expect(await defineLasso(d)).toEqual({ok: false, text: copy['error.unplaced']});
    expect(d.insert).not.toHaveBeenCalled();
    expect(d.fail).toHaveBeenCalledWith(UNPLACED);
  });
});
