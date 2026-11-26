import {
  afterBatch,
  Converter,
  elementShape,
  MATCH_TOLERANCE_PX,
  matchShapes,
  pageStrokesOf,
  textBoxFor,
} from '../src/convert';
import {lastConversion, setLastConversion} from '../src/undo';
import {DEFAULT_WORD_OPTIONS} from '../src/words';
import {fakeTablet} from '../test-support/host';
import {letter, stroke} from '../test-support/ink';

beforeEach(() => setLastConversion(null));

async function writeWord(
  tablet: ReturnType<typeof fakeTablet>,
  converter: Converter,
  afterInk: () => void = () => {},
) {
  converter.start();
  [0, 30, 60].forEach((left, index) => tablet.penUp(letter(left), index * 200));
  afterInk();
  await tablet.advance(400 + DEFAULT_WORD_OPTIONS.idleMs);
  await converter.idle();
}

test('a finished word becomes one text box in one page change', async () => {
  const tablet = fakeTablet('café');
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  tablet.page.push({uuid: 'before', type: 0, numInPage: 0}); // ink written earlier stays
  await writeWord(tablet, converter);
  expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledTimes(1);
  expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledWith(
    [1, 2, 3],
    [expect.objectContaining({type: 500})],
    0,
  );
  expect(tablet.page.map(element => element.type)).toEqual([0, 500]);
  expect(tablet.page[1].textBox?.textContentFull).toBe('café');
  expect(lastConversion()?.strokes).toHaveLength(3);
});

test('nothing converts before the word is finished', async () => {
  const tablet = fakeTablet();
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  converter.start();
  tablet.penUp(letter(0), 0);
  await tablet.advance(DEFAULT_WORD_OPTIONS.idleMs - 1);
  expect(tablet.host.recognizeElements).not.toHaveBeenCalled();
});

test('an answer that is not a word leaves the page untouched', async () => {
  const tablet = fakeTablet('  ');
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  await writeWord(tablet, converter);
  expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
  expect(tablet.logs).toContain('kept: empty answer');
});

test('a failed recognition leaves the page untouched and says why', async () => {
  const tablet = fakeTablet();
  (tablet.host.recognizeElements as jest.Mock).mockResolvedValueOnce({
    ok: false,
    code: 117,
    message: 'refused',
  });
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  await writeWord(tablet, converter);
  expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
  expect(tablet.logs).toContain('kept: recognizeElements refused');
});

test('a drawing never reaches recognition', async () => {
  const tablet = fakeTablet();
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  converter.start();
  tablet.penUp(letter(0), 0);
  tablet.penUp(stroke(30, 0, 40, 300), 200); // a tall stroke on the word's line
  await tablet.advance(200 + DEFAULT_WORD_OPTIONS.idleMs);
  await converter.idle();
  expect(tablet.host.recognizeElements).not.toHaveBeenCalled();
  expect(tablet.page.every(element => element.type === 0)).toBe(true);
});

test('turning the mode off stops the listener and drops the open word', async () => {
  const tablet = fakeTablet();
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  converter.start();
  tablet.penUp(letter(0), 0);
  converter.turnOff();
  expect(tablet.listening).toBe(false);
  await tablet.advance(10_000);
  expect(tablet.host.recognizeElements).not.toHaveBeenCalled();
  expect(tablet.host.recycleElement).toHaveBeenCalled();
});

test('a failed pen-up listener is the answer, never a silent «on»', () => {
  const tablet = fakeTablet();
  (tablet.host.onPenUp as jest.Mock).mockReturnValueOnce({ok: false, code: -1, message: 'no'});
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  expect(converter.start().ok).toBe(false);
  expect(converter.running).toBe(false);
});

test('stroke numbers and page elements are read again by id; a stroke gone keeps the word', () => {
  const word = {strokes: [letter(0), letter(30)], rect: {left: 0, top: 0, right: 1, bottom: 1}, letterHeight: 40};
  const page = [
    {uuid: word.strokes[1].id, numInPage: 4},
    {uuid: word.strokes[0].id, numInPage: 2},
  ];
  expect(pageStrokesOf(word, page)).toEqual({ok: true, value: {nums: [2, 4], elements: [page[1], page[0]]}});
  expect(pageStrokesOf(word, page.slice(1))).toMatchObject({
    ok: false,
    message: '1 of 2 strokes of the word are not in the page read of 1 elements',
  });
});

test('recognition is sent the page read of the word, never the pen-up elements (#206)', async () => {
  const tablet = fakeTablet('café');
  const penUps: object[] = [];
  const listen = tablet.host.onPenUp;
  tablet.host.onPenUp = jest.fn(next =>
    listen(elements => {
      penUps.push(...elements);
      next(elements);
    }),
  );
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  await writeWord(tablet, converter);
  const [sent] = (tablet.host.recognizeElements as jest.Mock).mock.calls[0] as [object[]];
  expect(sent).toHaveLength(3);
  expect(sent.every(element => !penUps.includes(element))).toBe(true);
  // A page element: it carries its number in the page, which the pen-up copy lacks.
  expect(sent.map(element => (element as {numInPage?: number}).numInPage)).toEqual([0, 1, 2]);
  expect(tablet.logs).toContain(
    'recognize: 3 page elements of 3 read, types 0:3, fields numInPage,points,type,uuid, stroke fields none',
  );
});

test('the shape line names fields and counts, never points or text', () => {
  const line = elementShape(
    [
      {uuid: 'a', type: 0, numInPage: 3, stroke: {points: {}, penType: 10}},
      {uuid: 'b', type: 0, numInPage: 4, stroke: {points: {}}},
    ],
    9,
  );
  expect(line).toBe(
    'recognize: 2 page elements of 9 read, types 0:2, fields numInPage,stroke,type,uuid, stroke fields penType,points',
  );
});

test('the text box starts at the word, sized to its letters, inside the page', () => {
  const word = {strokes: [], rect: {left: 1380, top: 100, right: 1400, bottom: 140}, letterHeight: 40};
  const box = textBoxFor('não', word, {width: 1404, height: 1872});
  expect(box.fontSize).toBe(56);
  expect(box.rect.right).toBeLessThanOrEqual(1404);
  expect(box.rect.top).toBe(100);
  expect(box.rect.bottom - box.rect.top).toBe(84);
});

test('a stroke the page read gives another uuid is found by its bounds (#206)', () => {
  const word = {strokes: [letter(0), letter(30)], rect: {left: 0, top: 0, right: 1, bottom: 1}, letterHeight: 40};
  const near = {uuid: 'page-b', numInPage: 7};
  const far = {uuid: 'page-x', numInPage: 8};
  const first = {uuid: 'page-a', numInPage: 6};
  const page = [first, near, far];
  const rects = new Map<object, {left: number; top: number; right: number; bottom: number}>([
    [first, {left: 0.4, top: 100.3, right: 20.2, bottom: 139.6}],
    [near, {left: 31, top: 101, right: 50, bottom: 140}],
    [far, {left: 30 + MATCH_TOLERANCE_PX + 1, top: 100, right: 50, bottom: 140}],
  ]);
  expect(pageStrokesOf(word, page, rects)).toEqual({ok: true, value: {nums: [6, 7], elements: [first, near]}});
  rects.delete(near);
  expect(pageStrokesOf(word, page, rects)).toMatchObject({
    ok: false,
    message: '1 of 2 strokes of the word are not in the page read of 3 elements',
  });
});

test('one page stroke is never taken for two strokes of the word', () => {
  const word = {strokes: [letter(0), letter(0)], rect: {left: 0, top: 0, right: 1, bottom: 1}, letterHeight: 40};
  const only = {uuid: 'page-a', numInPage: 1};
  const rects = new Map([[only as object, {left: 0, top: 100, right: 20, bottom: 140}]]);
  expect(pageStrokesOf(word, [only], rects).ok).toBe(false);
});

test('the match line gives both shapes of one stroke, field names, counts and first points', () => {
  expect(
    matchShapes(
      {uuid: 'u1', type: 0, stroke: {points: {}}},
      [{x: 3823, y: 12143}, {x: 3900, y: 12000}],
      true,
      {uuid: 'u2', type: 0, numInPage: 3, stroke: {points: {}, penType: 10}},
      [{x: 458.4, y: 451.6}],
    ),
  ).toBe(
    'match: pen-up fields stroke,type,uuid, numInPage none, stroke fields points, 2 points, first 3823,12143 EMR; ' +
      'page fields numInPage,stroke,type,uuid, numInPage 3, stroke fields penType,points, 1 points, first 458,452 page px; ' +
      'same uuid false',
  );
});

test('a word kept before recognition logs its stroke heights, numbers only', async () => {
  const tablet = fakeTablet();
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  converter.start();
  tablet.penUp(letter(0), 0);
  tablet.penUp(stroke(30, 0, 40, 300), 200);
  await tablet.advance(200 + DEFAULT_WORD_OPTIONS.idleMs);
  await converter.idle();
  expect(tablet.logs).toContain('kept: tall, 2 strokes, heights 40,300 px');
});

describe('pen times (#296)', () => {
  const wide = {...DEFAULT_WORD_OPTIONS, spacing: 1.4};
  const timed = (left: number, startedAt: number) => ({
    ...letter(left),
    times: {startedAt, endedAt: startedAt + 100},
  });

  test('a long pause before a wide gap splits two words, and the first times are logged once', async () => {
    const tablet = fakeTablet('ab');
    const converter = new Converter(tablet.host, wide);
    converter.start();
    tablet.penUp(timed(0, 0), 100);
    tablet.penUp(timed(30, 200), 300);
    tablet.penUp(timed(90, 1100), 1200);
    await tablet.advance(1200 + wide.idleMs);
    await converter.idle();
    expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledTimes(2);
    expect(tablet.logs.filter(line => line.startsWith('times:'))).toEqual([
      'times: first 0 to 100, read in 0 ms',
    ]);
  });

  test('strokes with no times are one word by position alone, and that is logged', async () => {
    const tablet = fakeTablet('abc');
    const converter = new Converter(tablet.host, wide);
    converter.start();
    tablet.penUp(letter(0), 100);
    tablet.penUp(letter(30), 300);
    tablet.penUp(letter(90), 1200);
    await tablet.advance(1200 + wide.idleMs);
    await converter.idle();
    expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledTimes(1);
    expect(tablet.logs).toContain('times: none filled, read in 0 ms: position alone');
  });
});

describe('reloadFile after a conversion (#296)', () => {
  test('afterBatch: a redraw needs none; a pen down or unknown never reloads', () => {
    expect(afterBatch(0, 'up')).toBe('redrawn');
    expect(afterBatch(true, 'up')).toBe('reload');
    expect(afterBatch(1, 'up')).toBe('reload');
    expect(afterBatch(true, 'down')).toBe('pen down');
    expect(afterBatch(true, 'unknown')).toBe('pen unknown');
  });

  /** One word written and converted on `tablet`, with `afterInk` run once the ink is down. */
  const converted = async (tablet: ReturnType<typeof fakeTablet>, afterInk?: () => void) =>
    writeWord(tablet, new Converter(tablet.host, DEFAULT_WORD_OPTIONS), afterInk);

  test('a batch with no redraw reloads the page once the pen is up, and logs its answer', async () => {
    const tablet = fakeTablet('café');
    await converted(tablet);
    expect(tablet.host.reloadFile).toHaveBeenCalledTimes(1);
    expect(tablet.logs).toEqual(
      expect.arrayContaining(['batch: answered true', 'reload: answered true in 0 ms']),
    );
  });

  test('never reloads while the pen is down', async () => {
    const tablet = fakeTablet('café');
    await converted(tablet, () => tablet.motion(0));
    expect(tablet.host.batchUpdatePageElements).toHaveBeenCalledTimes(1);
    expect(tablet.host.reloadFile).not.toHaveBeenCalled();
    expect(tablet.logs).toContain('reload: not run: pen down');
  });

  test('a failed motion listener means no reload, said once', async () => {
    const tablet = fakeTablet('café');
    (tablet.host.onMotion as jest.Mock).mockReturnValueOnce({ok: false, code: -1, message: 'refused'});
    await converted(tablet);
    expect(tablet.logs).toEqual(
      expect.arrayContaining([
        'motion listener failed: refused: no reload after a conversion',
        'reload: not run: pen unknown',
      ]),
    );
  });

  test('a failed reload keeps the conversion and is logged', async () => {
    const tablet = fakeTablet('café');
    (tablet.host.reloadFile as jest.Mock).mockResolvedValueOnce({ok: false, code: 7, message: 'no note'});
    await converted(tablet);
    expect(tablet.page[tablet.page.length - 1].textBox?.textContentFull).toBe('café');
    expect(tablet.logs).toContain('reload failed: 7 no note in 0 ms');
  });

  test('turning the mode off removes the motion listener too', async () => {
    const tablet = fakeTablet();
    const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
    converter.start();
    const stopMotion = (tablet.host.onMotion as jest.Mock).mock.results[0].value.value;
    expect(typeof stopMotion).toBe('function');
    converter.turnOff();
    tablet.motion(0);
    expect(converter.running).toBe(false);
  });
});
