/**
 * The summary answers are written from the MediaWiki Action API's documented shape
 * (`generator=search` with `prop=extracts`); the cloud proxy refuses `*.wikipedia.org`, so none is
 * recorded yet (#114 State). The people and topics are synthetic.
 */
import {
  MAX_SUMMARY_CHARACTERS,
  parseSummary,
  summarizeFirst,
  summaryUrl,
  SUMMARY_SENTENCES,
} from '../src/encyclopedia';

const answer = (page: object | null) =>
  JSON.stringify({batchcomplete: true, ...(page && {query: {pages: [page]}})});

describe('summaryUrl', () => {
  it('asks one Wikipedia for the best article and only its plain intro', () => {
    const url = summaryUrl('  Example   Person ', 'pt');
    expect(url).toMatch(/^https:\/\/pt\.wikipedia\.org\/w\/api\.php\?/);
    expect(url).toContain(`gsrsearch=${encodeURIComponent('Example Person')}&`);
    expect(url).toContain('gsrlimit=1');
    expect(url).toContain('exintro=1');
    expect(url).toContain('explaintext=1');
    expect(url).toContain(`exsentences=${SUMMARY_SENTENCES}`);
    expect(url).toContain(`prop=${encodeURIComponent('extracts|pageprops')}`);
  });
});

describe('parseSummary', () => {
  it('gives the article title and its intro on one line', () => {
    const text = answer({
      title: 'Example Person',
      extract: 'Example Person is a synthetic\npolitician. They were born in 1900.',
    });
    expect(parseSummary(text, 'pt')).toEqual({
      title: 'Example Person',
      text: 'Example Person is a synthetic politician. They were born in 1900.',
      language: 'pt',
    });
  });

  it('gives no summary for no article, an empty intro or a disambiguation page', () => {
    expect(parseSummary(answer(null), 'pt')).toBeNull();
    expect(parseSummary(answer({title: 'Example', extract: ''}), 'pt')).toBeNull();
    expect(
      parseSummary(
        answer({title: 'Example', extract: 'Example may mean:', pageprops: {disambiguation: ''}}),
        'pt',
      ),
    ).toBeNull();
  });

  it('cuts a long intro at a word, with an ellipsis', () => {
    const long = 'word '.repeat(200);
    const summary = parseSummary(answer({title: 'Long', extract: long}), 'es');
    expect(summary?.text.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARACTERS);
    expect(summary?.text.endsWith('word…')).toBe(true);
  });

  it('throws on an error answer or a body that is not the API, never «no article»', () => {
    expect(() => parseSummary('{"error":{"code":"maxlag","info":"lag"}}', 'pt')).toThrow('maxlag');
    expect(() => parseSummary('<html>', 'pt')).toThrow();
    expect(() => parseSummary('{}', 'pt')).toThrow();
  });
});

describe('summarizeFirst', () => {
  it('asks the next language when one has no article or fails, and names the failure', async () => {
    const fetchText = jest
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce(answer({title: 'Ejemplo', extract: 'Ejemplo es un tema.'}));
    const result = await summarizeFirst(fetchText, 'ejemplo', ['pt', 'es']);
    expect(fetchText.mock.calls.map(call => call[0])).toEqual([
      summaryUrl('ejemplo', 'pt'),
      summaryUrl('ejemplo', 'es'),
    ]);
    expect(result).toEqual({
      summary: {title: 'Ejemplo', text: 'Ejemplo es un tema.', language: 'es'},
      errors: ['wikipedia pt: HTTP 503'],
    });
  });

  it('is empty, with no error, when no Wikipedia has an article', async () => {
    const fetchText = jest.fn().mockResolvedValue(answer(null));
    expect(await summarizeFirst(fetchText, 'zzzz', ['pt', 'es'])).toEqual({
      summary: null,
      errors: [],
    });
  });
});
