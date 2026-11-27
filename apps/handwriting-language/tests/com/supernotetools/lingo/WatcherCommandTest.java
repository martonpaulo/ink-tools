package com.supernotetools.lingo;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/**
 * The README's developer ADB command that turns on writing detection keeps every other enabled
 * accessibility service (#489): its commands run in `sh` against a stand-in `adb` and `settings`
 * that keep each setting in a file, and neither the README nor AGENTS.md shows a line that writes
 * the list without reading it. The screen shows no command at all (#494), so the README holds it.
 * Run by `node scripts/build.cjs --test` with the app folder as its argument.
 */
public final class WatcherCommandTest {
  private static final String SETTING = "enabled_accessibility_services";
  private static final String OTHER = "com.example.other/.OtherService";

  private static final String WATCHER = Copy.PACKAGE + "/.WritingWatcher";
  private static final String SCRIPT_START = "adb shell '\n";
  private static final String SCRIPT_END = "esac'";
  private static final String TURN_ON = "adb shell settings put secure accessibility_enabled 1";

  public static void main(String[] args) throws IOException, InterruptedException {
    File app = new File(args.length > 0 ? args[0] : ".");
    List<String> commands = commands(new File(app, "README.md"));
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
      enables(commands, work, bin, null, WATCHER);
      enables(commands, work, bin, "", WATCHER);
      enables(commands, work, bin, OTHER, OTHER + ":" + WATCHER);
      enables(commands, work, bin, WATCHER + ":" + OTHER, WATCHER + ":" + OTHER);
      enables(commands, work, bin, OTHER + ":" + WATCHER, OTHER + ":" + WATCHER);
      // The Accessibility screen writes the class name in full (measured on the Manta, #489).
      String full = Copy.PACKAGE + "/" + Copy.PACKAGE + ".WritingWatcher";
      enables(commands, work, bin, full + ":" + OTHER, full + ":" + OTHER);
    } finally {
      delete(work.toFile());
    }
    for (String name : Arrays.asList("README.md", "AGENTS.md")) {
      readsFirst(new File(app, name), commands);
    }
    System.out.println("WatcherCommandTest ok");
  }

  /** From the enabled list `before` (null: never set), the command leaves `after` and turns accessibility on. */
  private static void enables(List<String> commands, Path work, Path bin, String before, String after) throws IOException, InterruptedException {
    Path store = Files.createTempDirectory(work, "store-");
    if (before != null) {
      Files.write(store.resolve(SETTING), (before + "\n").getBytes(StandardCharsets.UTF_8));
    }
    for (String line : commands) {
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

  /** The README's two commands: the script from `adb shell '` to `esac'`, then the one that turns accessibility on. */
  private static List<String> commands(File readme) throws IOException {
    String text = new String(Files.readAllBytes(readme.toPath()), StandardCharsets.UTF_8);
    int start = text.indexOf(SCRIPT_START);
    int end = text.indexOf(SCRIPT_END, start);
    LanguageCycleTest.check(start >= 0 && end > start, "the README shows the watcher script");
    LanguageCycleTest.check(text.contains(TURN_ON), "the README shows the command that turns accessibility on");
    return Arrays.asList(text.substring(start, end + SCRIPT_END.length()), TURN_ON);
  }

  /** Every line of `file` that writes the list is a line of the script, which reads it first. */
  private static void readsFirst(File file, List<String> commands) throws IOException {
    List<String> script = Arrays.asList(commands.get(0).split("\n"));
    for (String line : Files.readAllLines(file.toPath(), StandardCharsets.UTF_8)) {
      if (line.contains("put secure " + SETTING)) {
        LanguageCycleTest.check(script.contains(line.trim()), file.getName() + " shows only the command that keeps the other services: " + line);
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
