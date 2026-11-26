/**
 * A page as PNG bytes (#379): the form the page probe chose, a greyscale PNG that a plugin writes
 * to `MyStyle/` and passes by its path to `insertNotePage` (#377).
 *
 * 8-bit greyscale, each row filtered by the row above, in one zlib stream of fixed-Huffman deflate
 * whose only matches repeat the byte before (distance 1). A page is mostly white rows equal to the
 * row above, so it packs to a few tens of kilobytes with no compression library on the tablet.
 * shortcut: no match longer back than one byte; upgrade to a hashed LZ77 search if a page with
 * dense text ever weighs too much.
 */
import { GREY_STEP } from './look';
import { assertNativeGreys, type Raster } from './raster';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const FILTER_NONE = 0;
const FILTER_UP = 2;
/** IHDR: 8 bits per sample, colour type 0 (greyscale), deflate, the standard filters, no interlace. */
const BIT_DEPTH = 8;
const COLOUR_GREY = 0;
/** zlib header: deflate with a 32 K window, no dictionary, the check bits that make it divide by 31. */
const ZLIB_HEADER = [0x78, 0x01];
const ADLER_MOD = 65521;
/** The largest run Adler-32 can sum before its 32-bit halves must be reduced. */
const ADLER_BLOCK = 5552;

const MIN_MATCH = 3;
const MAX_MATCH = 258;
/** RFC 1951 3.2.5: the first length of each length code 257 to 285, and its extra bits. */
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const FIRST_LENGTH_CODE = 257;
/** The symbol just before the length codes ends the block. */
const END_OF_BLOCK = FIRST_LENGTH_CODE - 1;

class ByteSink {
  private buffer = new Uint8Array(1 << 16);
  length = 0;
  push(byte: number): void {
    if (this.length === this.buffer.length) {
      const bigger = new Uint8Array(this.buffer.length * 2);
      bigger.set(this.buffer);
      this.buffer = bigger;
    }
    this.buffer[this.length++] = byte;
  }
  pushAll(bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i++) this.push(bytes[i]);
  }
  bytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

/** Deflate's bit order: values least significant bit first, Huffman codes most significant first. */
class BitWriter {
  private bits = 0;
  private count = 0;
  constructor(readonly sink: ByteSink) {}
  write(value: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.bits |= ((value >>> i) & 1) << this.count;
      if (++this.count === 8) this.flushByte();
    }
  }
  writeCode(code: number, n: number): void {
    for (let i = n - 1; i >= 0; i--) this.write((code >>> i) & 1, 1);
  }
  finish(): void {
    if (this.count > 0) this.flushByte();
  }
  private flushByte(): void {
    this.sink.push(this.bits);
    this.bits = 0;
    this.count = 0;
  }
}

/** RFC 1951 3.2.6: the fixed codes, as ranges of symbols [first, end) with the first code and its bits. */
const FIXED_CODES: readonly (readonly [first: number, end: number, code: number, bits: number])[] = [
  [0, 144, 0x30, 8],
  [144, 256, 0x190, 9],
  [256, 280, 0, 7],
  [280, 288, 0xc0, 8],
];
/** Distance 1 is distance code 0, five bits, no extra bits. */
const DISTANCE_ONE = { code: 0, bits: 5 } as const;

function writeSymbol(out: BitWriter, symbol: number): void {
  for (const [first, end, code, bits] of FIXED_CODES) {
    if (symbol < end) {
      out.writeCode(code + symbol - first, bits);
      return;
    }
  }
}

function writeMatch(out: BitWriter, length: number): void {
  let code = LENGTH_BASE.length - 1;
  while (LENGTH_BASE[code] > length) code--;
  writeSymbol(out, FIRST_LENGTH_CODE + code);
  out.write(length - LENGTH_BASE[code], LENGTH_EXTRA[code]);
  out.writeCode(DISTANCE_ONE.code, DISTANCE_ONE.bits);
}

/** True for each byte value that is one of the 16 native greys. */
const NATIVE = (() => {
  const table = new Uint8Array(256);
  for (let v = 0; v < 256; v += GREY_STEP) table[v] = 1;
  return table;
})();

/** Bytes per 32-bit word: rows whose width is a multiple of it are compared a word at a time. */
const WORD = 4;

/**
 * One pass over the page: checks each grey, filters each row by the row above, deflates the
 * filtered bytes as literals and runs, and sums their Adler-32. A page is 4.9 million pixels and
 * the tablet's engine has no JIT, so pixels equal to the ones above (most of a page) are found a
 * 32-bit word at a time and added as zero runs in closed form; only the rest go byte by byte.
 */
function deflatePage(raster: Raster, sink: ByteSink): number {
  const { width, height, pixels } = raster;
  const out = new BitWriter(sink);
  out.write(1, 1); // the last block
  out.write(1, 2); // fixed Huffman codes
  let a = 1;
  let b = 0;
  let sinceReduce = 0;
  let runByte = -1;
  let runLength = 0;
  const flushRun = () => {
    if (runLength === 0) return;
    writeSymbol(out, runByte);
    let left = runLength - 1;
    while (left >= MIN_MATCH) {
      const length = Math.min(left, MAX_MATCH);
      writeMatch(out, length);
      left -= length;
    }
    for (; left > 0; left--) writeSymbol(out, runByte);
    runLength = 0;
  };
  const take = (byte: number) => {
    a += byte;
    b += a;
    if (++sinceReduce === ADLER_BLOCK) {
      a %= ADLER_MOD;
      b %= ADLER_MOD;
      sinceReduce = 0;
    }
    if (byte === runByte) {
      runLength++;
      return;
    }
    flushRun();
    runByte = byte;
    runLength = 1;
  };
  /** `n` zero bytes: Adler-32's first sum stays, the second gains n times it. */
  const zeros = (n: number) => {
    b = (b + n * a) % ADLER_MOD;
    if (runByte !== 0) {
      flushRun();
      runByte = 0;
    }
    runLength += n;
  };
  const words = width % WORD === 0 ? new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.length / WORD) : null;
  const rowWords = width / WORD;
  const byteAt = (y: number, x: number) => {
    const v = pixels[y * width + x];
    if (NATIVE[v] === 0) assertNativeGreys(raster);
    take(y === 0 ? v : (v - pixels[(y - 1) * width + x]) & 0xff);
  };
  for (let y = 0; y < height; y++) {
    take(y === 0 ? FILTER_NONE : FILTER_UP);
    if (y === 0 || !words) {
      for (let x = 0; x < width; x++) byteAt(y, x);
      continue;
    }
    const row = y * rowWords;
    let same = 0;
    for (let w = 0; w < rowWords; w++) {
      if (words[row + w] === words[row - rowWords + w]) {
        same++;
        continue;
      }
      if (same > 0) zeros(same * WORD);
      same = 0;
      for (let x = w * WORD; x < (w + 1) * WORD; x++) byteAt(y, x);
    }
    if (same > 0) zeros(same * WORD);
  }
  flushRun();
  writeSymbol(out, END_OF_BLOCK);
  out.finish();
  return (((b % ADLER_MOD) << 16) | (a % ADLER_MOD)) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const UINT32_BYTES = 4;
/** A chunk type is four ASCII letters. */
const TYPE_BYTES = 4;

/** A number as four bytes, most significant first, as PNG and zlib store it. */
function uint32(value: number): number[] {
  const bytes = new Uint8Array(UINT32_BYTES);
  new DataView(bytes.buffer).setUint32(0, value);
  return [...bytes];
}

function chunk(sink: ByteSink, type: string, data: Uint8Array): void {
  const typed = new Uint8Array(TYPE_BYTES + data.length);
  for (let i = 0; i < TYPE_BYTES; i++) typed[i] = type.charCodeAt(i);
  typed.set(data, TYPE_BYTES);
  sink.pushAll(uint32(data.length));
  sink.pushAll(typed);
  sink.pushAll(uint32(crc32(typed)));
}

/** The page as a greyscale PNG; refuses a page with a grey the screen does not show. */
export function encodePng(raster: Raster): Uint8Array {
  const zlib = new ByteSink();
  zlib.pushAll(ZLIB_HEADER);
  const adler = deflatePage(raster, zlib);
  zlib.pushAll(uint32(adler));

  const png = new ByteSink();
  png.pushAll(SIGNATURE);
  chunk(png, 'IHDR', new Uint8Array([...uint32(raster.width), ...uint32(raster.height), BIT_DEPTH, COLOUR_GREY, 0, 0, 0]));
  chunk(png, 'IDAT', zlib.bytes());
  chunk(png, 'IEND', new Uint8Array(0));
  return png.bytes();
}
