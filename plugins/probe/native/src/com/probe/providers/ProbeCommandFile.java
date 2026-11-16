package com.probe.providers;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Issue #148: reads the one command file inkctl pushes for the «Run Command» button. Only files in
 * {@link #FOLDER}, inside PluginHost's whitelist (MyStyle), and at most {@link #MAX_BYTES}. Pure Java.
 */
final class ProbeCommandFile {
  static final String FOLDER = "/storage/emulated/0/MyStyle/Probe";
  static final int MAX_BYTES = 1 << 20;

  private ProbeCommandFile() {}

  /** The file's text; throws with a one-line reason for a path outside FOLDER, a missing or a too large file. */
  static String read(String path) throws IOException {
    File file = new File(path);
    String parent = file.getCanonicalFile().getParent();
    if (parent == null || !parent.equals(new File(FOLDER).getCanonicalPath())) {
      throw new IOException("not in " + FOLDER + ": " + path);
    }
    if (file.length() > MAX_BYTES) {
      throw new IOException("larger than " + MAX_BYTES + " bytes: " + path);
    }
    try (InputStream in = new FileInputStream(file)) {
      return readAll(in);
    }
  }

  static String readAll(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int count;
    while ((count = in.read(buffer)) != -1) {
      out.write(buffer, 0, count);
      if (out.size() > MAX_BYTES) {
        throw new IOException("larger than " + MAX_BYTES + " bytes");
      }
    }
    return new String(out.toByteArray(), StandardCharsets.UTF_8);
  }
}
