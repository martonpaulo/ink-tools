package com.inktools.files;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** JVM tests for StickerCollection, run by the packages gate (#35). */
public final class StickerCollectionTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }

  public static void main(String[] args) throws Exception {
    byte[] sticker = "synthetic sticker bytes".getBytes("UTF-8");
    File folder = Files.createTempDirectory("inktools-snstk").toFile();
    File source = new File(folder, "apple.sticker");
    Files.write(source.toPath(), sticker);
    File collection = new File(folder, "EXPORT/apple.snstk");
    long written = StickerCollection.write(source, collection);
    check(written == collection.length() && written > 0, "the byte count is the collection's size");
    try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(Files.readAllBytes(collection.toPath())))) {
      ZipEntry entry = zip.getNextEntry();
      check(entry != null && entry.getName().equals("apple.sticker"), "the one entry is the sticker by its file name");
      java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
      byte[] buffer = new byte[256];
      for (int n; (n = zip.read(buffer)) > 0; ) {
        out.write(buffer, 0, n);
      }
      byte[] read = out.toByteArray();
      check(Arrays.equals(read, sticker), "the entry holds the sticker's bytes");
      check(zip.getNextEntry() == null, "the collection holds one entry");
    }
    for (String bad : new String[] {"", "a/b.sticker", "apple.png"}) {
      try {
        StickerCollection.zip(bad, sticker);
        check(false, "refuses the entry name " + bad);
      } catch (IOException expected) {
        // refused
      }
    }
    if (failures > 0) {
      System.exit(1);
    }
    System.out.println("StickerCollectionTest: ok");
  }
}
