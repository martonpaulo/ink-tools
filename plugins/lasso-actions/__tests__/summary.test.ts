/** «Insert Summary» in Lookup (#114): the text, its box, the failures and the button. */
import {LassoPlace, Summary} from '@ink-tools/ink-core';
import {ok} from '@ink-tools/sn-adapter/official';
import {BUTTONS} from '../src/buttons';
import {copy} from '../src/copy';
import {LANGUAGES} from '../src/definition';
import {TRANSLATIONS} from '../src/modes';
import {defaultSettings} from '../src/settings';
import {
  SUMMARY_BUTTON_ID,
  SummaryDeps,
  summaryLasso,
  summaryText,
} from '../src/summary';

const place: LassoPlace = {
  rect: {left: 372, top: 300, right: 572, bottom: 380},
  page: 0,
  pageSize: {width: 1920, height: 2560},
};

const found: Summary = {
  title: 'Example Person',
  text: 'Example Person is a synthetic politician. They were born in 1900.',
  language: 'pt',
};

function deps(
  over: Partial<SummaryDeps> = {},
): SummaryDeps & {lines: string[]} {
  const lines: string[] = [];
  return {
    read: async () => ({ok: true, value: {query: 'example person', place}}),
    summarize: async () => ({summary: found, errors: []}),
    insert: jest.fn(async () => ok(true)),
    log: line => lines.push(line),
    fail: jest.fn(),
    now: () => 0,
    lines,
    ...over,
  };
}

test('the text: the article title, its summary, then the source', () => {
  expect(summaryText(found)).toBe(
    'Example Person\nExample Person is a synthetic politician. They were born in 1900.\n(Wikipedia)',
  );
});

test('a press asks the summary in the definition languages and inserts it below the word', async () => {
  const d = deps({
    summarize: jest.fn(async () => ({summary: found, errors: []})),
  });
  expect(await summaryLasso(d)).toEqual({ok: true, text: summaryText(found)});
  expect(d.summarize).toHaveBeenCalledWith('example person', LANGUAGES);
  const box = (d.insert as jest.Mock).mock.calls[0][0];
  expect(box.text).toBe(summaryText(found));
  expect(box.rect.top).toBeGreaterThan(place.rect.bottom);
  expect(d.lines.some(line => line.includes('«Example Person» from pt'))).toBe(
    true,
  );
});

test('no article writes that no summary was found; a failure says Wikipedia could not be reached', async () => {
  const none = deps({summarize: async () => ({summary: null, errors: []})});
  expect(await summaryLasso(none)).toEqual({
    ok: false,
    text: copy['summary.none']('example person'),
  });
  const down = deps({
    summarize: async () => ({
      summary: null,
      errors: ['wikipedia pt: HTTP 503'],
    }),
  });
  expect(await summaryLasso(down)).toEqual({
    ok: false,
    text: copy['summary.failed']('example person'),
  });
  expect(down.lines).toContain('summary: wikipedia pt: HTTP 503');
});

test('a lasso that cannot be read inserts nothing and says why', async () => {
  const d = deps({
    read: async () => ({ok: false, code: 1, message: 'No handwriting.'}),
  });
  expect(await summaryLasso(d)).toEqual({ok: false, text: 'No handwriting.'});
  expect(d.insert).not.toHaveBeenCalled();
});

test('a failed insert says the summary could not be inserted', async () => {
  const d = deps({insert: jest.fn(async () => ok(false))});
  expect(await summaryLasso(d)).toEqual({
    ok: false,
    text: copy['summary.insert'],
  });
});

test('«Insert Summary» is its own button and switch, on by default, its id clear of every other', () => {
  const button = BUTTONS.find(each => each.id === SUMMARY_BUTTON_ID);
  expect(button?.name).toBe('Insert Summary');
  expect(button?.switch).toEqual({key: 'summary'});
  expect(defaultSettings.summary).toBe(true);
  const ids = BUTTONS.map(each => each.id);
  expect(new Set(ids).size).toBe(ids.length);
  // Room for many new translation pairs before their ids reach this one.
  const lastTranslation = Math.max(...TRANSLATIONS.map(each => each.buttonId));
  expect(SUMMARY_BUTTON_ID - lastTranslation).toBeGreaterThan(50);
});
