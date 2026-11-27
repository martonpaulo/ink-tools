/** «Convert to Text» (#250, moved from Smart Pen by #306) over a fake page: one recognition, one page change. */
import {fail, ok, textBoxFields, THROWN_CODE} from '@ink-tools/sn-adapter/official';
import {MIN_FONT_SIZE, type InkStroke} from '@ink-tools/ink-core/conversion';
import {stroke} from '../../../packages/ink-core/testing/ink';
import {
  convertLasso,
  lassoBoxFor,
  paragraphsOf,
  type LassoConvertHost,
} from '../src/convert/lasso';
import {CONVERT_BUTTONS, CONVERT_ID} from '../src/convert/buttons';
import {convertPress} from '../src/convert/run';
import {copy} from '../src/copy';

type FakeElement = {
  uuid: string;
  type: number;
  numInPage?: number;
  points?: {x: number; y: number}[];
  textBox?: {textRect: object; textContentFull: string};
};

/** A page of synthetic elements, a lasso over some of them, and recognition that answers `answer`. */
function fakeTablet(answer = 'café') {
  const page: FakeElement[] = [];
  const logs: string[] = [];
  let lassoed: number[] = [];
  const renumber = () => page.forEach((element, index) => (element.numInPage = index));
  const inLasso = () => page.filter(element => lassoed.includes(element.numInPage as number));
  const host: LassoConvertHost = {
    getLassoElements: jest.fn(async () => ok(inLasso().map(element => ({...element})))),
    getLassoRect: jest.fn(async () => {
      const points = inLasso().flatMap(element => element.points ?? []);
      const xs = points.map(point => point.x);
      const ys = points.map(point => point.y);
      return points.length > 0
        ? ok({left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)})
        : fail(THROWN_CODE, 'no lasso');
    }),
    getCurrentFilePath: jest.fn(async () => ok('/Note/test.note')),
    getCurrentPageNum: jest.fn(async () => ok(0)),
    getPageSize: jest.fn(async () => ok({width: 1404, height: 1872})),
    recognizeElements: jest.fn(async () => ok(answer)),
    createTextBox: jest.fn(async box => ok({type: 500, textBox: textBoxFields(box)})),
    batchUpdatePageElements: jest.fn(async (nums: number[], elements: object[]) => {
      const kept = page.filter(element => !nums.includes(element.numInPage as number));
      page.length = 0;
      page.push(...kept);
      elements.forEach((element, index) => {
        const made = element as {type: number; textBox?: FakeElement['textBox']};
        page.push({uuid: `new${index}`, type: made.type, ...(made.textBox ? {textBox: {...made.textBox}} : {})});
      });
      renumber();
      return ok(true);
    }),
    recycleElement: jest.fn(async () => ok(true as const)),
    log: line => logs.push(line),
  };
  return {
    host,
    page,
    logs,
    /** Writes the strokes on the page in page pixels and lassoes them, as the person's lasso does. */
    lassoStrokes(strokes: InkStroke[]) {
      const first = page.length;
      strokes.forEach(each => page.push({uuid: `page-${each.id}`, type: 0, points: each.points}));
      renumber();
      lassoed = strokes.map((_, index) => first + index);
    },
  };
}

const PAGE = {width: 1404, height: 1872};

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

test('a lasso at fractional page pixels gives a box of whole pixels, which the SDK takes (#206)', () => {
  const box = lassoBoxFor('a', {left: 100.4, top: 200.6, right: 300.2, bottom: 260.7}, PAGE);
  for (const side of Object.values(box.rect)) {
    expect(Number.isInteger(side)).toBe(true);
  }
});

test('a press says what it did: a toast for a conversion or an empty lasso, the Error state for a failure', async () => {
  const show = {toast: jest.fn(), fail: jest.fn()};
  expect(await convertPress(paragraph('one').host, show)).toBe('converted');
  expect(show.toast).toHaveBeenLastCalledWith(copy['convert.done']);
  const empty = fakeTablet();
  empty.lassoStrokes([]);
  expect(await convertPress(empty.host, show)).toBe('empty');
  expect(show.toast).toHaveBeenLastCalledWith(copy['convert.empty']);
  expect(show.fail).not.toHaveBeenCalled();
  expect(await convertPress(paragraph('').host, show)).toBe('failed');
  expect(show.fail).toHaveBeenCalledWith(expect.objectContaining({what: copy['convert.failed']}));
});

test('its one lasso button reads the lasso and writes the page, and its id is clear of every other', () => {
  expect(CONVERT_BUTTONS.map(button => button.id)).toEqual([CONVERT_ID]);
  expect(CONVERT_BUTTONS[0].name).toBe('Convert to Text');
  expect(CONVERT_BUTTONS[0].needs.map(need => need.permission)).toEqual([
    'plugin.permission.FILE:READ',
    'plugin.permission.FILE:WRITE',
  ]);
});
