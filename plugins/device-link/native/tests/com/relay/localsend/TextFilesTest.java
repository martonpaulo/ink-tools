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
      check(TextFiles.delete(file) && !file.exists(), "a delete removes the file");
      check(TextFiles.delete(file), "a missing file counts as deleted");
      // A received note moves into its folder, and never over a note already there (#504).
      File received = new File(folder, "received-1.note");
      Files.write(received.toPath(), new byte[] {1, 2, 3});
      File placed = new File(new File(folder, "Note"), "Plan.note");
      check(TextFiles.move(received, placed), "a received note moves to a free path");
      check(placed.isFile() && !received.exists(), "the note is moved, not copied");
      Files.write(received.toPath(), new byte[] {4});
      check(!TextFiles.move(received, placed), "a move never replaces a note");
      check(Files.readAllBytes(placed.toPath()).length == 3, "the note there is kept whole");
      check(received.isFile(), "a refused move keeps the received file");
      check(!TextFiles.move(new File(folder, "missing.note"), new File(folder, "x.note")),
          "a missing source does not move");
      received.delete();
      placed.delete();
      placed.getParentFile().delete();
      File guarded =
          new File(folder, "guarded") {
            private static final long serialVersionUID = 1L;

            @Override
            public boolean exists() {
              return true;
            }

            @Override
            public boolean delete() {
              throw new SecurityException("not allowed to delete sdcard path outside whitelist");
            }
          };
      // PluginHost's refusal must come back as false, never a throw that hangs the view (#164).
      check(!TextFiles.delete(guarded), "a refused delete answers false");
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
