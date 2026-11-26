package com.supernotetools.lingo;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.TreeSet;

/** Plain JVM test over a fake disk: run by `node scripts/build.cjs --test`. */
public final class LanguageFilesTest {
  private static final String ROOT = "/sdcard/.data/dictionary";

  /** Files and folders as paths; records each write in order. */
  static final class FakeDisk implements LanguageFiles.Disk {
    final TreeSet<String> files = new TreeSet<>();
    final TreeSet<String> folders = new TreeSet<>();
    final List<String> writes = new ArrayList<>();
    boolean failCreate;

    @Override
    public List<String> list(String folder) throws IOException {
      if (!folders.contains(folder)) {
        throw new IOException("cannot read " + folder);
      }
      List<String> names = new ArrayList<>();
      for (String path : union()) {
        if (path.startsWith(folder + "/") && path.indexOf('/', folder.length() + 1) < 0) {
          names.add(path.substring(folder.length() + 1));
        }
      }
      return names;
    }

    @Override
    public boolean isFolder(String path) {
      return folders.contains(path);
    }

    @Override
    public void createEmpty(String path) throws IOException {
      if (failCreate) {
        throw new IOException("denied");
      }
      writes.add("create " + path);
      files.add(path);
    }

    @Override
    public void delete(String path) throws IOException {
      if (!files.remove(path)) {
        throw new IOException("missing " + path);
      }
      writes.add("delete " + path);
    }

    private TreeSet<String> union() {
      TreeSet<String> all = new TreeSet<>(files);
      all.addAll(folders);
      return all;
    }
  }

  static FakeDisk tablet(String... active) {
    FakeDisk disk = new FakeDisk();
    disk.folders.add(ROOT + "/default");
    disk.folders.add(ROOT + "/resources");
    for (String pack : new String[] {"en_US", "es_ES", "pt_BR", "zh_CN", "zh_TW", "ja_JP", "math", "mul"}) {
      disk.folders.add(ROOT + "/resources/" + pack);
    }
    for (String code : active) {
      disk.files.add(ROOT + "/default/" + code);
    }
    return disk;
  }

  public static void main(String[] args) throws IOException {
    FakeDisk disk = tablet("pt_BR");
    LanguageFiles files = new LanguageFiles(disk, ROOT);
    check(
        files.installed().equals(Arrays.asList("pt_BR", "en_US", "es_ES", "ja_JP", "zh_CN", "zh_TW")),
        "installed: the code folders only, in cycle order");
    check("pt_BR".equals(files.current()), "the current language is the one file");

    LanguageFiles.Switch step = files.cycle(LanguageCycle.DEFAULT);
    check("pt_BR".equals(step.from) && "en_US".equals(step.to), "one tap: pt_BR to en_US");
    check(
        disk.writes.equals(Arrays.asList("create " + ROOT + "/default/en_US", "delete " + ROOT + "/default/pt_BR")),
        "the new file is created before the old one is deleted: " + disk.writes);
    check(files.current().equals("en_US"), "one file is left");
    files.cycle(LanguageCycle.DEFAULT);
    files.cycle(LanguageCycle.DEFAULT);
    check(files.current().equals("pt_BR"), "three taps come back to pt_BR");

    FakeDisk empty = tablet();
    check(new LanguageFiles(empty, ROOT).current().equals("en_US"), "an empty folder reads as en_US");
    check(new LanguageFiles(empty, ROOT).cycle(LanguageCycle.DEFAULT).to.equals("es_ES"), "from the empty en_US to es_ES");

    FakeDisk crowded = tablet("es_ES", "pt_BR");
    crowded.files.add(ROOT + "/default/.keep");
    LanguageFiles crowdedFiles = new LanguageFiles(crowded, ROOT);
    check(crowdedFiles.current() == null, "two code files: the language is unknown");
    LanguageFiles.Switch repaired = crowdedFiles.cycle(LanguageCycle.DEFAULT);
    check(repaired.from == null && repaired.to.equals("pt_BR"), "an unknown language goes to the first");
    check(crowdedFiles.current().equals("pt_BR"), "one code file is left");
    check(crowded.files.contains(ROOT + "/default/.keep"), "a file that is not a code is left alone");

    FakeDisk missingPack = tablet("pt_BR");
    missingPack.folders.remove(ROOT + "/resources/en_US");
    LanguageFiles missingFiles = new LanguageFiles(missingPack, ROOT);
    check(missingFiles.cycle(LanguageCycle.DEFAULT).to.equals("es_ES"), "a cycle language with no pack is skipped");
    refused(() -> missingFiles.set("en_US"), "a language that is not installed is refused");
    refused(() -> missingFiles.set("../x"), "a name that is not a code is refused");
    check(missingFiles.current().equals("es_ES"), "a refused set changes nothing");
    refused(() -> missingFiles.cycle(Arrays.asList("en_US")), "a cycle with nothing installed is refused");

    FakeDisk denied = tablet("pt_BR");
    denied.failCreate = true;
    refused(() -> new LanguageFiles(denied, ROOT).cycle(LanguageCycle.DEFAULT), "a denied write is raised");
    check(denied.files.contains(ROOT + "/default/pt_BR"), "a denied create deletes nothing");

    FakeDisk unreadable = tablet("pt_BR");
    unreadable.folders.remove(ROOT + "/resources");
    refused(() -> new LanguageFiles(unreadable, ROOT).installed(), "an unreadable resources folder is raised, never an empty list");
    portContract();
    System.out.println("LanguageFilesTest ok");
  }

  /**
   * The language folder's port (#294): it runs the implementation the registry item names, and a
   * kill switch that is off stops every operation before the disk is touched (#293).
   */
  static void portContract() throws IOException {
    Registry.Item on = InternalFailure.item(FileFailure.LANGUAGE_FILE_ITEM);
    check(on.active.equals(LanguageFiles.ANDROID_FILES), "the registry names the AndroidFiles implementation");
    FakeDisk disk = tablet("pt_BR");
    LanguageFiles files = new LanguageFiles(LanguageFiles.port(on, java.util.Collections.<String, LanguageFiles.Disk>singletonMap(on.active, disk)), ROOT);
    check(files.cycle(LanguageCycle.DEFAULT).to.equals("en_US"), "the port runs the active implementation");

    Registry.Item off = new Registry.Item(on.id, on.level, on.impact, on.owner, on.probe, on.unprobed, on.active,
        "until 2026-12-31: the folder moved");
    FakeDisk untouched = tablet("pt_BR");
    LanguageFiles stopped = new LanguageFiles(LanguageFiles.port(off, java.util.Collections.<String, LanguageFiles.Disk>singletonMap(on.active, untouched)), ROOT);
    try {
      stopped.cycle(LanguageCycle.DEFAULT);
      throw new AssertionError("a module turned off is refused");
    } catch (FileFailure expected) {
      check(expected.kind == FileFailure.Kind.TURNED_OFF, "a module turned off fails as TURNED_OFF");
    }
    check(untouched.writes.isEmpty(), "a module turned off writes nothing");
    try {
      LanguageFiles.port(on, java.util.Collections.<String, LanguageFiles.Disk>emptyMap());
      throw new AssertionError("an item with no implementation of its active name is refused");
    } catch (IllegalStateException expected) {
      check(expected.getMessage().contains(on.active), "the refusal names the active implementation");
    }
  }

  interface Action {
    void run() throws IOException;
  }

  static void refused(Action action, String what) {
    try {
      action.run();
    } catch (IOException expected) {
      return;
    }
    throw new AssertionError(what);
  }

  static void check(boolean condition, String what) {
    LanguageCycleTest.check(condition, what);
  }
}
