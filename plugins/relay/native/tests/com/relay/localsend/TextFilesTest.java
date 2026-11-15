package com.relay.localsend;

import java.io.File;
import java.nio.file.Files;

/** Plain JVM test, no framework: run by `npm run test:native`. */
public final class TextFilesTest {
  public static void main(String[] args) throws Exception {
    File folder = Files.createTempDirectory("relay-text-").toFile();
    File nested = new File(folder, "relay");
    File file = new File(nested, "settings.json");
    try {
      check(TextFiles.read(file) == null, "a missing file reads as null");
      TextFiles.write(file, "{\"a\":1}");
      TextFiles.write(file, "{\"b\":\"ü\"}");
      check(TextFiles.read(file).equals("{\"b\":\"ü\"}"), "the last write wins, in UTF-8");
      check(!new File(nested, "settings.json.part").exists(), "no part file is left");
      Files.write(file.toPath(), new byte[TextFiles.MAX_BYTES + 1]);
      try {
        TextFiles.read(file);
        throw new AssertionError("a file over the limit must be refused");
      } catch (java.io.IOException expected) {
        // refused
      }
    } finally {
      file.delete();
      nested.delete();
      folder.delete();
    }
    System.out.println("TextFilesTest ok");
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
