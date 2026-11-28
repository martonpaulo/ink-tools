/** «Convert to Text» (#250) over a fake page: one recognition, one page change, undone by «Undo Conversion». */
import {
  convertLasso,
  lassoBoxFor,
  paragraphsOf,
} from '../src/modules/text/lasso';
import {
  MIN_FONT_SIZE,
  typedWidth,
  lastConversion,
  setLastConversion,
  undoLast,
} from '@ink-tools/ink-core/conversion';
import {PAGE_BAR_PX} from '@ink-tools/ink-core';
import {fakeTablet} from '../test-support/host';
import {stroke} from '../../../packages/ink-core/testing/ink';

const PAGE = {width: 1404, height: 1872};

beforeEach(() => setLastConversion(null));

/** Three handwritten lines of two strokes each, 120 px apart, over a page that already has ink. */
function paragraph(answer: string) {
  const tablet = fakeTablet(answer);
  tablet.page.push({
    uuid: 'other',
    type: 0,
    numInPage: 0,
    points: [{x: 900, y: 900}],
  });
  const lines = [0, 1, 2].flatMap(line => [
    stroke(100, 200 + line * 120, 200, 60),
    stroke(320, 200 + line * 120, 200, 60),
  ]);
  tablet.lassoStrokes(lines);
  return tablet;
}

test('a lassoed paragraph becomes one text box in one recognition and one page change', async () => {
  const tablet = paragraph('first line\nsecond line\nthird line');
  expect(await convertLasso(tablet.host)).toBe('converted');
  expect(tablet.host.recognizeElements).toHaveBeenCalledTimes(1);
  expect(
    (tablet.host.recognizeElements as jest.Mock).mock.calls[0][0],
  ).toHaveLength(6);
  expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledTimes(1);
  expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledWith(
    [1, 2, 3, 4, 5, 6],
    [expect.anything()],
    0,
  );
  expect(tablet.page.map(element => element.type)).toEqual([0, 500]);
  const box = tablet.page[1].textBox as unknown as {
    textContentFull: string;
    textRect: {left: number; top: number};
  };
  expect(box.textContentFull).toBe('first line\nsecond line\nthird line');
  expect(box.textRect).toMatchObject({left: 100, top: 200});
});

test('«Undo Conversion» brings the lassoed strokes back', async () => {
  const tablet = paragraph('one\ntwo\nthree');
  await convertLasso(tablet.host);
  expect(lastConversion()?.strokes).toHaveLength(6);
  expect(await undoLast(tablet.host)).toBe('undone');
  expect(tablet.page.map(element => element.type)).toEqual([
    0, 0, 0, 0, 0, 0, 0,
  ]);
});

test('a lasso with no handwriting changes nothing', async () => {
  const tablet = fakeTablet();
  tablet.lassoStrokes([]);
  expect(await convertLasso(tablet.host)).toBe('empty');
  expect(tablet.host.recognizeElements).not.toHaveBeenCalled();
  expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
});

test('a failed or empty recognition keeps the handwriting', async () => {
  for (const answer of ['  \n ', '']) {
    const tablet = paragraph(answer);
    expect(await convertLasso(tablet.host)).toBe('failed');
    expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
    expect(tablet.page).toHaveLength(7);
  }
  const tablet = paragraph('text');
  (tablet.host.recognizeElements as jest.Mock).mockResolvedValueOnce({
    ok: false,
    code: 117,
    message: 'Recognition failed',
  });
  expect(await convertLasso(tablet.host)).toBe('failed');
  expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
  expect(lastConversion()).toBeNull();
});

test('every lassoed element is freed, converted or not', async () => {
  const tablet = paragraph('text');
  await convertLasso(tablet.host);
  expect(tablet.host.recycleElement).toHaveBeenCalledTimes(6);
});

test('line breaks stay as paragraphs, blank lines and spaces at the ends go', () => {
  expect(paragraphsOf(' one \r\n\n two\nthree ')).toBe('one\ntwo\nthree');
});

test('the box covers the lasso, one line per paragraph, inside the page', () => {
  const box = lassoBoxFor(
    'a\nb\nc',
    {left: 100, top: 200, right: 520, bottom: 560},
    PAGE,
  );
  expect(box.rect.left).toBe(100);
  expect(box.rect.top).toBe(200);
  expect(box.rect.right).toBeGreaterThanOrEqual(520);
  expect(box.rect.bottom).toBeGreaterThanOrEqual(560);
  expect(box.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
  const edge = lassoBoxFor(
    'word',
    {left: 1380, top: 1860, right: 1404, bottom: 1872},
    PAGE,
  );
  expect(edge.rect.right).toBeLessThanOrEqual(PAGE.width);
  expect(edge.rect.bottom).toBeLessThanOrEqual(PAGE.height);
  expect(edge.fontSize).toBe(MIN_FONT_SIZE);
});

test('the box never reaches the note\'s page bar, for a word or a paragraph inside it (#577)', () => {
  const manta = {width: 1920, height: 2560};
  const floor = manta.height - PAGE_BAR_PX;
  for (const top of [300, 2330, 2400, 2444, 2472, 2540]) {
    for (const text of ['mesa', 'a\nb\nc']) {
      const lines = text.split('\n').length;
      const rect = {left: 100, top, right: 260, bottom: top + 40 * lines};
      const box = lassoBoxFor(text, rect, manta);
      expect(box.rect.bottom).toBeLessThanOrEqual(floor);
      expect(box.rect.top).toBeGreaterThanOrEqual(0);
    }
  }
});

describe('the box holds its widest paragraph as the Note app types it, so no last letter wraps (#590)', () => {
  // A 4-letter word 70 px wide under a lasso 60 px high, tight handwriting.
  const rect = {left: 100, top: 300, right: 170, bottom: 360};
  /** The word's width in Roboto, the Note app's text-box font, in font sizes (advance widths). */
  const roboto: Record<string, number> = {mesa: 2.41, 'mamá': 2.78, WWW: 2.66, hola: 1.87};

  test.each(Object.entries(roboto))('«%s» gets its typed width and a font size each side', (word, ems) => {
    const box = lassoBoxFor(word, rect, PAGE);
    expect(box.rect.right - box.rect.left).toBeGreaterThanOrEqual(Math.ceil((ems + 2) * box.fontSize));
    // One line: no wrapped line is counted.
    expect(box.rect.bottom - box.rect.top).toBe(Math.max(60, Math.ceil(box.fontSize * 1.5)));
  });

  test('«mesa» is wider than the box that wrapped its «a» on the tablet (row 140)', () => {
    const box = lassoBoxFor('mesa', rect, PAGE);
    // c02cc022: four average letters (0.55 of the font size each) and one font size more.
    expect(box.rect.right - box.rect.left).toBeGreaterThan(Math.ceil(4 * 0.55 * box.fontSize) + box.fontSize);
  });

  test('a paragraph wider than the page counts its wrapped lines, and they stay above the bar (#577)', () => {
    const manta = {width: 1920, height: 2560};
    const long = 'm'.repeat(80);
    const box = lassoBoxFor(long, {left: 100, top: 2472, right: 900, bottom: 2512}, manta);
    const lines = Math.ceil(typedWidth(long, box.fontSize) / (box.rect.right - box.rect.left - 2 * box.fontSize));
    expect(lines).toBeGreaterThan(1);
    expect(box.rect.bottom - box.rect.top).toBeGreaterThanOrEqual(lines * box.fontSize * 1.5);
    expect(box.rect.bottom).toBeLessThanOrEqual(manta.height - PAGE_BAR_PX);
  });
});
