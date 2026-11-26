import {
  boxNumber,
  setLastConversion,
  undoLast,
  Converter,
  DEFAULT_WORD_OPTIONS,
} from '@ink-tools/ink-core/conversion';
import {fakeTablet} from '../test-support/host';
import {letter} from '../../../packages/ink-core/testing/ink';

beforeEach(() => setLastConversion(null));

async function convertOneWord() {
  const tablet = fakeTablet('não');
  const converter = new Converter(tablet.host, DEFAULT_WORD_OPTIONS);
  converter.start();
  [0, 30, 60].forEach((left, index) => tablet.penUp(letter(left), index * 200));
  await tablet.advance(400 + DEFAULT_WORD_OPTIONS.idleMs);
  await converter.idle();
  return tablet;
}

test('undo deletes the text box and puts the saved strokes back, in one page change', async () => {
  const tablet = await convertOneWord();
  expect(tablet.page.map(element => element.type)).toEqual([500]);
  expect(await undoLast(tablet.host)).toBe('undone');
  expect(tablet.host.batchUpdatePageElements).toHaveBeenLastCalledWith(
    [0],
    [expect.anything(), expect.anything(), expect.anything()],
    0,
  );
  expect(tablet.page.map(element => element.type)).toEqual([0, 0, 0]);
  expect(tablet.host.rebuildStroke).toHaveBeenCalledWith(
    expect.objectContaining({penType: 10, thickness: 400}),
  );
});

test('with no conversion, undo does nothing', async () => {
  const tablet = fakeTablet();
  expect(await undoLast(tablet.host)).toBe('nothing');
  expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
});

test('a second undo finds nothing to undo', async () => {
  const tablet = await convertOneWord();
  await undoLast(tablet.host);
  expect(await undoLast(tablet.host)).toBe('nothing');
});

test('the last conversion is never applied on another page', async () => {
  const tablet = await convertOneWord();
  (tablet.host.getCurrentPageNum as jest.Mock).mockResolvedValueOnce({
    ok: true,
    value: 3,
  });
  const calls = (tablet.host.batchUpdatePageElements as jest.Mock).mock.calls
    .length;
  expect(await undoLast(tablet.host)).toBe('nothing');
  expect(
    (tablet.host.batchUpdatePageElements as jest.Mock).mock.calls,
  ).toHaveLength(calls);
});

test('a text box edited or removed since leaves the page untouched', async () => {
  const tablet = await convertOneWord();
  tablet.page[0].textBox = {
    textRect: {left: 0, top: 100, right: 99, bottom: 160},
    textContentFull: 'nao',
  };
  expect(await undoLast(tablet.host)).toBe('nothing');
  expect(tablet.page.map(element => element.type)).toEqual([500]);
});

test('the box is found by its text and a rect within a few pixels', () => {
  const conversion = {
    path: 'p',
    page: 0,
    box: {
      text: 'a',
      rect: {left: 10, top: 10, right: 50, bottom: 50},
      fontSize: 30,
    },
    strokes: [],
  };
  const page = [
    {
      type: 500,
      numInPage: 7,
      textBox: {
        textContentFull: 'a',
        textRect: {left: 12, top: 9, right: 50, bottom: 53},
      },
    },
  ];
  expect(boxNumber(conversion, page)).toEqual({ok: true, value: 7});
  expect(boxNumber(conversion, [{...page[0], type: 0}]).ok).toBe(false);
});
