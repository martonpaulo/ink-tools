/**
 * The two defects of the beta 5 pen test (#206) and the undo after a real conversion: a word whose
 * page rect is fractional (converted EMR points) was refused by batchUpdatePageElements, a
 * recognition that answered null threw at `trim`, and undo did not find the box the host wrote.
 */
import {
  recognizeElements,
  textBoxFields,
} from '@ink-tools/sn-adapter/official';
import {PluginCommAPI} from 'sn-plugin-lib';
import {Converter} from '../src/convert';
import {lastConversion, setLastConversion, undoLast} from '../src/undo';
import {DEFAULT_WORD_OPTIONS} from '../src/words';
import {fakeTablet} from '../test-support/host';
import {stroke} from '../test-support/ink';

beforeEach(() => setLastConversion(null));

/** Three letters at fractional page pixels, as converted EMR points are on the tablet. */
async function writeFractionalWord(
  tablet: ReturnType<typeof fakeTablet>,
  converter: Converter,
) {
  converter.start();
  [0.37, 30.61, 60.13].forEach((left, index) =>
    tablet.penUp(stroke(left, 100.29, 20.45, 40.18), index * 200),
  );
  await tablet.advance(400 + DEFAULT_WORD_OPTIONS.idleMs);
  await converter.idle();
}

test('a word at fractional page pixels converts: the text box rect is whole pixels', async () => {
  // A short answer, so the box is as wide as the ink, a fractional width.
  const tablet = fakeTablet('no');
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  await writeFractionalWord(tablet, converter);
  expect(
    tablet.logs.filter(line => line.includes('must be an integer')),
  ).toEqual([]);
  expect(tablet.logs).toContain('converted 2 characters from 3 strokes');
  expect(tablet.page.map(element => element.type)).toEqual([500]);
});

test('the SDK text box fields always hold an integer rect', () => {
  const fields = textBoxFields({
    text: 'a',
    rect: {left: 10.4, top: 20.6, right: 90.5, bottom: 60.49},
    fontSize: 56,
  });
  expect(fields.textRect).toEqual({left: 10, top: 21, right: 91, bottom: 60});
});

test('a recognition that answers null keeps the word and says so, never throws', async () => {
  (PluginCommAPI.recognizeElements as jest.Mock).mockResolvedValue({
    success: true,
    result: null,
  });
  const tablet = fakeTablet();
  tablet.host.recognizeElements = recognizeElements;
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  await writeFractionalWord(tablet, converter);
  expect(tablet.logs.filter(line => line.startsWith('convert:'))).toEqual([]);
  expect(tablet.logs).toContain(
    'kept: recognizeElements recognition gave no text (null)',
  );
  expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
  expect(tablet.page.every(element => element.type === 0)).toBe(true);
});

test('undo finds the converted box after the host sized it again to its text', async () => {
  const tablet = fakeTablet('casa');
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  await writeFractionalWord(tablet, converter);
  expect(lastConversion()).not.toBeNull();
  // The host keeps the box's corner but gives it its own width and height [inference, #206].
  const box = tablet.page[0].textBox as {
    textRect: {left: number; top: number; right: number; bottom: number};
  };
  box.textRect = {
    ...box.textRect,
    right: box.textRect.left + 200,
    bottom: box.textRect.top + 77,
  };
  expect(await undoLast(tablet.host)).toBe('undone');
  expect(tablet.page.map(element => element.type)).toEqual([0, 0, 0]);
});

test('an undo that finds no box says what the page holds, in counts and rects only', async () => {
  const tablet = fakeTablet('casa');
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  await writeFractionalWord(tablet, converter);
  tablet.page.length = 0;
  expect(await undoLast(tablet.host)).toBe('nothing');
  expect(tablet.logs.at(-1)).toMatch(
    /^undo: the converted text box is no longer on the page: 0 text boxes, 0 with its text, nearest rect none, written \d+,\d+,\d+,\d+$/,
  );
});
