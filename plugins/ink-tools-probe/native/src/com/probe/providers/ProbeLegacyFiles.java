package com.probe.providers;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Issue #148, #22: builds before the channel moved to the hidden .data/plugin/ left inkctl's
 * command, action, page and picture files in MyStyle/Probe, which Supernote Cloud syncs. At start
 * Probe removes those files, by name and kind only, and never the folder itself: a MyStyle folder
 * deleted and made again can come back as a conflict copy. Pure Java.
 */
final class ProbeLegacyFiles {
  /** The folder the channel used before #148 moved it: `<shared root>/MyStyle/Probe`. */
  static final String FOLDER = "/storage/emulated/0/MyStyle/Probe";
  /** The kinds of file inkctl and Probe wrote there: commands, answers, pages, pictures, stickers. */
  private static final String[] KINDS = {".json", ".png", ".jpg", ".jpeg", ".sticker"};

  private ProbeLegacyFiles() {}

  /** Removes each of Probe's old files directly in `folder`; returns the names removed. */
  static List<String> remove(File folder) {
    List<String> removed = new ArrayList<>();
    File[] files = folder.listFiles();
    if (files == null) {
      return removed;
    }
    for (File file : files) {
      if (file.isFile() && isProbeFile(file.getName()) && file.delete()) {
        removed.add(file.getName());
      }
    }
    return removed;
  }

  static boolean isProbeFile(String name) {
    String lower = name.toLowerCase(Locale.ROOT);
    for (String kind : KINDS) {
      if (lower.endsWith(kind) && lower.length() > kind.length()) {
        return true;
      }
    }
    return false;
  }
}
