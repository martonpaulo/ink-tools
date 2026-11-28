import {charsPerLine, CHAR_SHARE, LINE_SHARE, lineHeight, TEXT_FONT_SIZE} from '../src/pageText';
import {LINE_SHARE as CONVERSION_LINE_SHARE} from '../src/conversion/convert';

test('a line is 1.5 font sizes in whole pixels', () => {
  expect(lineHeight(TEXT_FONT_SIZE)).toBe(48);
  expect(lineHeight(25)).toBe(38);
});

test('the characters per line use the shared width share, at least one', () => {
  expect(charsPerLine(640, TEXT_FONT_SIZE)).toBe(Math.floor(640 / (32 * CHAR_SHARE)));
  expect(charsPerLine(1, TEXT_FONT_SIZE)).toBe(1);
});

test('the conversion reads the same line share', () => {
  expect(CONVERSION_LINE_SHARE).toBe(LINE_SHARE);
});
