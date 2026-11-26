package com.retouch.image;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.zip.CRC32;
import java.util.zip.Deflater;

/**
 * A fast PNG encoder for Retouch's pictures (#145), plain Java, so JVM tests run it. Android's
 * {@code Bitmap.compress} writes PNG at zlib's default level and tries every row filter, and its
 * quality argument does nothing for PNG; on the Manta that encode is a large share of an edit's
 * time on a full-width picture. This writes zlib's fastest level with no row filter: a picture
 * whose pixels are all opaque gray (every Enhance, Lighter and Darker result) as 8-bit grayscale,
 * a quarter of the bytes, and any other as 8-bit RGBA, unpremultiplied as the pixels are.
 */
public final class Png {
  private static final byte[] SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
  /** IHDR colour types (PNG specification, 11.2.2). */
  static final int GRAY = 0;
  static final int RGBA = 6;
  private static final byte BIT_DEPTH = 8;
  /** IHDR's length: width, height, then five one-byte fields; the last three stay 0. */
  private static final int IHDR_BYTES = 13;
  /** Red, green, blue and alpha, one byte each. */
  private static final int RGBA_BYTES = 4;
  private static final int ALPHA_SHIFT = 24;
  private static final int RED_SHIFT = 16;
  private static final int GREEN_SHIFT = 8;
  private static final int MAX = Retouch.MAX;
  /** The bytes deflated or written per call. */
  private static final int CHUNK = 1 << 16;

  private Png() {}

  /** The colour type {@link #write} uses for `picture`: {@link #GRAY} or {@link #RGBA}. */
  static int colourType(Retouch.Picture picture) {
    for (int argb : picture.argb) {
      int b = argb & MAX;
      if (argb >>> ALPHA_SHIFT != MAX || ((argb >> GREEN_SHIFT) & MAX) != b
          || ((argb >> RED_SHIFT) & MAX) != b) {
        return RGBA;
      }
    }
    return GRAY;
  }

  /** Writes `picture` as a whole PNG to `out`; `out` stays open. */
  public static void write(Retouch.Picture picture, OutputStream out) throws IOException {
    int type = colourType(picture);
    int channels = type == GRAY ? 1 : RGBA_BYTES;
    int w = picture.width;
    int[] argb = picture.argb;
    byte[] row = new byte[1 + w * channels];
    ByteArrayOutputStream idat = new ByteArrayOutputStream();
    byte[] buffer = new byte[CHUNK];
    Deflater deflater = new Deflater(Deflater.BEST_SPEED);
    try {
      for (int y = 0; y < picture.height; y++) {
        // Byte 0 is the row's filter: 0, none.
        int at = 1;
        int base = y * w;
        if (type == GRAY) {
          for (int x = 0; x < w; x++) {
            row[at++] = (byte) argb[base + x];
          }
        } else {
          for (int x = 0; x < w; x++) {
            int c = argb[base + x];
            row[at++] = (byte) (c >> RED_SHIFT);
            row[at++] = (byte) (c >> GREEN_SHIFT);
            row[at++] = (byte) c;
            row[at++] = (byte) (c >>> ALPHA_SHIFT);
          }
        }
        deflater.setInput(row);
        while (!deflater.needsInput()) {
          idat.write(buffer, 0, deflater.deflate(buffer));
        }
      }
      deflater.finish();
      while (!deflater.finished()) {
        idat.write(buffer, 0, deflater.deflate(buffer));
      }
    } finally {
      deflater.end();
    }
    DataOutputStream data = new DataOutputStream(out);
    data.write(SIGNATURE);
    // Compression, filter method and interlace stay 0: deflate, adaptive, none.
    byte[] header = ByteBuffer.allocate(IHDR_BYTES).putInt(w).putInt(picture.height)
        .put(BIT_DEPTH).put((byte) type).array();
    chunk(data, "IHDR", header, header.length);
    chunk(data, "IDAT", idat.toByteArray(), idat.size());
    chunk(data, "IEND", new byte[0], 0);
    data.flush();
  }

  private static void chunk(DataOutputStream out, String type, byte[] data, int length)
      throws IOException {
    out.writeInt(length);
    byte[] name = type.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    out.write(name);
    CRC32 crc = new CRC32();
    crc.update(name);
    for (int at = 0; at < length; at += CHUNK) {
      int n = Math.min(CHUNK, length - at);
      out.write(data, at, n);
      crc.update(data, at, n);
    }
    out.writeInt((int) crc.getValue());
  }
}
