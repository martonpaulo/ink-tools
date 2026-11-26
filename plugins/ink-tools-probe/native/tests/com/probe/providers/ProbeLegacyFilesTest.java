package com.probe.providers;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;

/** Plain JVM test, no framework: run by `npm run test:native`. */
public final class ProbeLegacyFilesTest {
  public static void main(String[] args) throws IOException {
    File folder = Files.createTempDirectory("probe-legacy").toFile();
    for (String name : Arrays.asList("command.json", "cmd.json", "picture.png", "page.png", "a.sticker", "notes.txt")) {
      if (!new File(folder, name).createNewFile()) {
        throw new AssertionError("fixture " + name);
      }
    }
    File sub = new File(folder, "sub");
    if (!sub.mkdir() || !new File(sub, "keep.json").createNewFile()) {
      throw new AssertionError("fixture sub");
    }
    List<String> removed = ProbeLegacyFiles.remove(folder);
    if (removed.size() != 5) {
      throw new AssertionError("the five Probe files are removed, was " + removed);
    }
    check(new File(folder, "notes.txt").exists(), "a file of another kind stays");
    check(new File(sub, "keep.json").exists(), "a file in a folder below stays");
    check(folder.exists(), "the folder itself stays");
    check(ProbeLegacyFiles.remove(new File(folder, "missing")).isEmpty(), "a missing folder removes nothing");
    check(!ProbeLegacyFiles.isProbeFile(".json"), "a bare extension is not a Probe file");
    check(ProbeLegacyFiles.FOLDER.endsWith("/MyStyle/Probe"), "the old folder is MyStyle/Probe");
    check(!ProbeLegacyFiles.FOLDER.equals(Registry.StorageHelperChannel.FOLDER), "the channel no longer uses the old folder");
    new File(sub, "keep.json").delete();
    sub.delete();
    new File(folder, "notes.txt").delete();
    folder.delete();
    System.out.println("ProbeLegacyFilesTest ok");
  }

  static void check(boolean ok, String what) {
    if (!ok) {
      throw new AssertionError(what);
    }
  }
}
