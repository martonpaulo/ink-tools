package com.probe.providers;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Plain JVM test, no framework: run by `npm run test:native`. */
public final class ProbeCommandFileTest {
  public static void main(String[] args) throws IOException {
    refused("/storage/emulated/0/Note/private.note");
    refused("/storage/emulated/0/MyStyle/Probe/../../Note/a.note");
    refused("/storage/emulated/0/MyStyle/Probe/sub/command.json");
    String text = ProbeCommandFile.readAll(new ByteArrayInputStream("{\"op\":\"maçã\"}".getBytes(StandardCharsets.UTF_8)));
    if (!text.equals("{\"op\":\"maçã\"}")) {
      throw new AssertionError("UTF-8 text comes back whole, was " + text);
    }
    try {
      ProbeCommandFile.readAll(new ByteArrayInputStream(new byte[ProbeCommandFile.MAX_BYTES + 1]));
      throw new AssertionError("a file over the limit is refused");
    } catch (IOException expected) {
      // refused, as it must be
    }
    System.out.println("ProbeCommandFileTest ok");
  }

  static void refused(String path) {
    try {
      ProbeCommandFile.read(path);
    } catch (IOException error) {
      if (error.getMessage().startsWith("not in ")) {
        return;
      }
      throw new AssertionError("refused for the wrong reason: " + error.getMessage());
    }
    throw new AssertionError("a path outside the folder is refused: " + path);
  }
}
