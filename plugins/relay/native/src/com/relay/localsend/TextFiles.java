package com.relay.localsend;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;

/** Relay's small settings file (#98): read whole, replaced in one rename. Pure Java. */
public final class TextFiles {
  /** A settings file is small; a larger one is not ours and is refused. */
  public static final int MAX_BYTES = 64 * 1024;

  private static final Charset UTF_8 = Charset.forName("UTF-8");

  private TextFiles() {}

  /** The file's text, or null when it does not exist. */
  public static String read(File file) throws IOException {
    if (!file.exists()) {
      return null;
    }
    if (file.length() > MAX_BYTES) {
      throw new IOException("file too large");
    }
    InputStream in = new FileInputStream(file);
    try {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buffer = new byte[4096];
      int read;
      while ((read = in.read(buffer)) > 0) {
        out.write(buffer, 0, read);
      }
      return new String(out.toByteArray(), UTF_8);
    } finally {
      in.close();
    }
  }

  /** Writes beside the file, then renames over it, so a crash never leaves half a file. */
  public static void write(File file, String text) throws IOException {
    File folder = file.getAbsoluteFile().getParentFile();
    if (folder != null && !folder.isDirectory() && !folder.mkdirs()) {
      throw new IOException("cannot make the folder");
    }
    File part = new File(folder, file.getName() + ".part");
    FileOutputStream out = new FileOutputStream(part);
    try {
      out.write(text.getBytes(UTF_8));
      out.getFD().sync();
    } finally {
      out.close();
    }
    if (!part.renameTo(file)) {
      part.delete();
      throw new IOException("cannot replace the file");
    }
  }
}
