package com.supernotetools.lingo;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * The device's handwriting language on disk: one empty file named with the code in
 * `<root>/default/`, the installed packs as folders in `<root>/resources/`
 * (docs/research/2026-11-handwriting-language.md § 1 and § 7). Pure Java behind {@link Disk}.
 */
final class LanguageFiles {
  /** The few file operations the switch needs, so tests run over a fake disk. */
  interface Disk {
    /** The names in a folder; throws when it cannot be read. */
    List<String> list(String folder) throws IOException;

    boolean isFolder(String path);

    /** Creates an empty file, or keeps one that exists; throws when it cannot. */
    void createEmpty(String path) throws IOException;

    /** Deletes a file; throws when it cannot. */
    void delete(String path) throws IOException;
  }

  /** One switch: the language before (null when unknown) and after. */
  static final class Switch {
    final String from;
    final String to;

    Switch(String from, String to) {
      this.from = from;
      this.to = to;
    }
  }

  private final Disk disk;
  private final String defaults;
  private final String resources;

  LanguageFiles(Disk disk, String root) {
    this.disk = disk;
    this.defaults = root + "/default";
    this.resources = root + "/resources";
  }

  /** The installed language packs, in cycle order. */
  List<String> installed() throws IOException {
    List<String> codes = new ArrayList<>();
    for (String name : disk.list(resources)) {
      if (LanguageCycle.isCode(name) && disk.isFolder(resources + "/" + name)) {
        codes.add(name);
      }
    }
    return LanguageCycle.order(codes);
  }

  /** The active language; EMPTY_FOLDER_LANGUAGE for an empty folder; null with several files. */
  String current() throws IOException {
    List<String> codes = codeFiles();
    if (codes.isEmpty()) {
      return LanguageCycle.EMPTY_FOLDER_LANGUAGE;
    }
    return codes.size() == 1 ? codes.get(0) : null;
  }

  /**
   * Sets `code`: creates its file first, then deletes every other code file, so the folder is
   * never empty (an empty folder reads as English). Refuses a code whose pack is not installed.
   * Leaves a file whose name is not a code: it is not ours.
   */
  void set(String code) throws IOException {
    if (!LanguageCycle.isCode(code)) {
      throw new FileFailure(FileFailure.Kind.OTHER, "not a language code: " + code);
    }
    if (!installed().contains(code)) {
      throw new FileFailure(FileFailure.Kind.NOT_INSTALLED, "not installed: " + code);
    }
    disk.createEmpty(defaults + "/" + code);
    for (String other : codeFiles()) {
      if (!other.equals(code)) {
        disk.delete(defaults + "/" + other);
      }
    }
  }

  /** Moves to the next language of the chosen cycle, among the installed ones. */
  Switch cycle(Collection<String> chosen) throws IOException {
    List<String> cycle = new ArrayList<>(installed());
    cycle.retainAll(chosen);
    if (cycle.isEmpty()) {
      throw new FileFailure(FileFailure.Kind.NOTHING_TO_CYCLE, "no language of the cycle is installed");
    }
    String from = current();
    String to = LanguageCycle.next(cycle, from);
    set(to);
    return new Switch(from, to);
  }

  private List<String> codeFiles() throws IOException {
    List<String> codes = new ArrayList<>();
    for (String name : disk.list(defaults)) {
      if (LanguageCycle.isCode(name)) {
        codes.add(name);
      }
    }
    return codes;
  }
}
