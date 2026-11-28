package com.inktools.files;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * A sticker collection (#35): the built-in Sticker plugin's «Import» lists a ZIP file named
 * `.snstk` in `EXPORT` that holds `.sticker` files, not a lone `.sticker` (docs/supernote.md ›
 * Files and sync). The collection is named by its file name and holds one entry, the sticker under
 * its own file name. Plain Java, so the JVM tests run it.
 */
final class StickerCollection {
  private StickerCollection() {}

  /** The ZIP bytes of a collection whose one entry is `entryName` holding `sticker`. */
  static byte[] zip(String entryName, byte[] sticker) throws IOException {
    if (entryName.isEmpty() || entryName.contains("/") || !entryName.endsWith(".sticker")) {
      throw new IOException("not a sticker file name: " + entryName);
    }
    ByteArrayOutputStream bytes = new ByteArrayOutputStream(sticker.length + FileWrites.BUFFER);
    try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
      zip.putNextEntry(new ZipEntry(entryName));
      zip.write(sticker);
      zip.closeEntry();
    }
    return bytes.toByteArray();
  }

  /** Writes the collection of the `.sticker` file `sticker` to `collection`; its byte count. */
  static long write(File sticker, File collection) throws Exception {
    byte[] zipped = zip(sticker.getName(), Files.readAllBytes(sticker.toPath()));
    return FileWrites.writeAtomically(collection, new java.io.ByteArrayInputStream(zipped));
  }
}
