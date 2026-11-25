/** «Convert to Text» (#250) over a fake page: one recognition, one page change, undone by «Undo Conversion». */
import {convertLasso, lassoBoxFor, paragraphsOf} from '../src/lasso';
import {MIN_FONT_SIZE} from '../src/convert';
import {lastConversion, setLastConversion, undoLast} from '../src/undo';
import {fakeTablet} from '../test-support/host';
import {stroke} from '../test-support/ink';

const PAGE = {width: 1404, height: 1872};

beforeEach(() => setLastConversion(null));

/** Three handwritten lines of two strokes each, 120 px apart, over a page that already has ink. */
function paragraph(answer: string) {
  const tablet = fakeTablet(answer);
  tablet.page.push({uuid: 'other', type: 0, numInPage: 0, points: [{x: 900, y: 900}]});
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
  expect((tablet.host.recognizeElements as jest.Mock).mock.calls[0][0]).toHaveLength(6);
  expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledTimes(1);
  expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6], [expect.anything()], 0);
  expect(tablet.page.map(element => element.type)).toEqual([0, 500]);
  const box = tablet.page[1].textBox as unknown as {textContentFull: string; textRect: {left: number; top: number}};
  expect(box.textContentFull).toBe('first line\nsecond line\nthird line');
  expect(box.textRect).toMatchObject({left: 100, top: 200});
});

test('«Undo Conversion» brings the lassoed strokes back', async () => {
  const tablet = paragraph('one\ntwo\nthree');
  await convertLasso(tablet.host);
  expect(lastConversion()?.strokes).toHaveLength(6);
  expect(await undoLast(tablet.host)).toBe('undone');
  expect(tablet.page.map(element => element.type)).toEqual([0, 0, 0, 0, 0, 0, 0]);
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
  (tablet.host.recognizeElements as jest.Mock).mockResolvedValueOnce({ok: false, code: 117, message: 'Recognition failed'});
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
  const box = lassoBoxFor('a\nb\nc', {left: 100, top: 200, right: 520, bottom: 560}, PAGE);
  expect(box.rect.left).toBe(100);
  expect(box.rect.top).toBe(200);
  expect(box.rect.right).toBeGreaterThanOrEqual(520);
  expect(box.rect.bottom).toBeGreaterThanOrEqual(560);
  expect(box.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
  const edge = lassoBoxFor('word', {left: 1380, top: 1860, right: 1404, bottom: 1872}, PAGE);
  expect(edge.rect.right).toBeLessThanOrEqual(PAGE.width);
  expect(edge.rect.bottom).toBeLessThanOrEqual(PAGE.height);
  expect(edge.fontSize).toBe(MIN_FONT_SIZE);
});
