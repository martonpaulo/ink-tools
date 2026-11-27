package com.supernotetools.lingo;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The ADB command that turns on writing detection keeps every other enabled accessibility
 * service (#489): its commands run in `sh` against a stand-in `adb` and `settings` that keep each
 * setting in a file. The app's README shows this command, and neither it nor AGENTS.md another. Run by
 * `node scripts/build.cjs --test` with the app folder as its argument.
 */
public final class WatcherCommandTest {
  private static final String SETTING = "enabled_accessibility_services";
  private static final String OTHER = "com.example.other/.OtherService";

  public static void main(String[] args) throws IOException, InterruptedException {
    Path work = Files.createTempDirectory("lingo-watcher-command-");
    try {
      Path bin = Files.createDirectory(work.resolve("bin"));
      script(bin.resolve("adb"), "[ \"$1\" = shell ] || exit 64\nshift\nexec sh -c \"$*\"\n");
      script(bin.resolve("settings"), "f=\"$STORE/$3\"\n"
          + "case \"$1\" in\n"
          + "  get) if [ -f \"$f\" ]; then cat \"$f\"; else echo null; fi ;;\n"
          + "  put) printf '%s\\n' \"$4\" > \"$f\" ;;\n"
          + "  *) exit 64 ;;\n"
          + "esac\n");
      enables(work, bin, null, Copy.WATCHER);
      enables(work, bin, "", Copy.WATCHER);
      enables(work, bin, OTHER, OTHER + ":" + Copy.WATCHER);
      enables(work, bin, Copy.WATCHER + ":" + OTHER, Copy.WATCHER + ":" + OTHER);
      enables(work, bin, OTHER + ":" + Copy.WATCHER, OTHER + ":" + Copy.WATCHER);
      // The Accessibility screen writes the class name in full (measured on the Manta, #489).
      String full = Copy.PACKAGE + "/" + Copy.PACKAGE + ".WritingWatcher";
      enables(work, bin, full + ":" + OTHER, full + ":" + OTHER);
    } finally {
      delete(work.toFile());
    }
    File app = new File(args.length > 0 ? args[0] : ".");
    shownAsIs(new File(app, "README.md"), true);
    shownAsIs(new File(app, "AGENTS.md"), false);
    System.out.println("WatcherCommandTest ok");
  }

  /** From the enabled list `before` (null: never set), the command leaves `after` and turns accessibility on. */
  private static void enables(Path work, Path bin, String before, String after) throws IOException, InterruptedException {
    Path store = Files.createTempDirectory(work, "store-");
    if (before != null) {
      Files.write(store.resolve(SETTING), (before + "\n").getBytes(StandardCharsets.UTF_8));
    }
    for (String line : Copy.WATCHER_COMMANDS) {
      ProcessBuilder shell = new ProcessBuilder("sh", "-c", line).redirectErrorStream(true);
      shell.environment().put("PATH", bin + File.pathSeparator + System.getenv("PATH"));
      shell.environment().put("STORE", store.toString());
      Process process = shell.start();
      String output = new String(readAll(process), StandardCharsets.UTF_8);
      LanguageCycleTest.check(process.waitFor() == 0, "the command runs: " + line + "\n" + output);
    }
    LanguageCycleTest.check(read(store, SETTING).equals(after), "from «" + before + "» the list reads «" + after + "», not «" + read(store, SETTING) + "»");
    LanguageCycleTest.check(read(store, "accessibility_enabled").equals("1"), "accessibility is on");
  }

  /** `file` shows each command whole when `whole`, and every line of it that writes the list is a line of the command. */
  private static void shownAsIs(File file, boolean whole) throws IOException {
    String text = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    List<String> command = new ArrayList<>();
    for (String each : Copy.WATCHER_COMMANDS) {
      LanguageCycleTest.check(!whole || text.contains(each), file.getName() + " shows the command whole: " + each);
      command.addAll(Arrays.asList(each.split("\n")));
    }
    for (String line : text.split("\n")) {
      if (line.contains("put secure " + SETTING)) {
        LanguageCycleTest.check(command.contains(line.trim()), file.getName() + " shows the command that keeps the other services: " + line);
      }
    }
  }

  private static void script(Path path, String body) throws IOException {
    Files.write(path, ("#!/bin/sh\n" + body).getBytes(StandardCharsets.UTF_8));
    LanguageCycleTest.check(path.toFile().setExecutable(true), "the stand-in " + path.getFileName() + " is executable");
  }

  private static String read(Path store, String name) throws IOException {
    return new String(Files.readAllBytes(store.resolve(name)), StandardCharsets.UTF_8).trim();
  }

  private static byte[] readAll(Process process) throws IOException {
    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
    byte[] buffer = new byte[4096];
    for (int n; (n = process.getInputStream().read(buffer)) > 0; ) {
      out.write(buffer, 0, n);
    }
    return out.toByteArray();
  }

  private static void delete(File file) {
    File[] children = file.listFiles();
    if (children != null) {
      for (File child : children) {
        delete(child);
      }
    }
    LanguageCycleTest.check(file.delete(), "removed " + file);
  }
}
