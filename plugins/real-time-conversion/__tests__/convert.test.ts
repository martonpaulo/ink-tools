import {Converter, numbersOf, textBoxFor} from '../src/convert';
import {lastConversion, setLastConversion} from '../src/undo';
import {DEFAULT_WORD_OPTIONS} from '../src/words';
import {fakeTablet} from '../test-support/host';
import {letter, stroke} from '../test-support/ink';

beforeEach(() => setLastConversion(null));

async function writeWord(tablet: ReturnType<typeof fakeTablet>, converter: Converter) {
  converter.start();
  [0, 30, 60].forEach((left, index) => tablet.penUp(letter(left), index * 200));
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

test('stroke numbers are read again by id; a stroke gone keeps the word', () => {
  const word = {strokes: [letter(0), letter(30)], rect: {left: 0, top: 0, right: 1, bottom: 1}, letterHeight: 40};
  const page = [
    {uuid: word.strokes[1].id, numInPage: 4},
    {uuid: word.strokes[0].id, numInPage: 2},
  ];
  expect(numbersOf(word, page)).toEqual({ok: true, value: [2, 4]});
  expect(numbersOf(word, page.slice(1)).ok).toBe(false);
});

test('the text box starts at the word, sized to its letters, inside the page', () => {
  const word = {strokes: [], rect: {left: 1380, top: 100, right: 1400, bottom: 140}, letterHeight: 40};
  const box = textBoxFor('não', word, {width: 1404, height: 1872});
  expect(box.fontSize).toBe(56);
  expect(box.rect.right).toBeLessThanOrEqual(1404);
  expect(box.rect.top).toBe(100);
  expect(box.rect.bottom - box.rect.top).toBe(84);
});
