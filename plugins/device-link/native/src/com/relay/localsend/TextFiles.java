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

  /**
   * Deletes the file; false when it stays. PluginHost throws a `SecurityException` for a path
   * outside its whitelist, and a throw in a native thread leaves the JS promise unsettled, so the
   * view hangs (#164); this never throws.
   */
  public static boolean delete(File file) {
    try {
      return !file.exists() || file.delete();
    } catch (SecurityException refused) {
      return false;
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
      delete(part);
      throw new IOException("cannot replace the file");
    }
  }

  /**
   * Moves a received file to `target`, which must not exist (#504): renamed when both share a
   * volume, else copied beside the target, synced, renamed into place, and the source deleted.
   * False when the target exists or the move fails; a failed move leaves no part file and never
   * throws, for the reason `delete` gives.
   */
  public static boolean move(File source, File target) {
    try {
      if (target.exists() || !source.isFile()) {
        return false;
      }
      File folder = target.getAbsoluteFile().getParentFile();
      if (folder != null && !folder.isDirectory() && !folder.mkdirs()) {
        return false;
      }
      if (source.renameTo(target)) {
        return true;
      }
      File part = new File(folder, target.getName() + ".part");
      try {
        copy(source, part);
      } catch (IOException failed) {
        delete(part);
        return false;
      }
      if (target.exists() || !part.renameTo(target)) {
        delete(part);
        return false;
      }
      delete(source);
      return true;
    } catch (SecurityException refused) {
      return false;
    }
  }

  private static void copy(File source, File target) throws IOException {
    InputStream in = new FileInputStream(source);
    try {
      FileOutputStream out = new FileOutputStream(target);
      try {
        byte[] buffer = new byte[MAX_BYTES];
        int read;
        while ((read = in.read(buffer)) > 0) {
          out.write(buffer, 0, read);
        }
        out.getFD().sync();
      } finally {
        out.close();
      }
    } finally {
      in.close();
    }
  }
}
