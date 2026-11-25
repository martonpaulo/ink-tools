package com.inktools.files;

import java.io.File;

/** JVM tests for SafePaths, run by the packages gate (`packages/native-build/package-tests.cjs`). */
public final class SafePathsTest {
  private static int failures = 0;

  private static void check(boolean condition, String name) {
    if (!condition) {
      failures++;
      System.err.println("FAIL " + name);
    }
  }


  private static String codeOfUrl(String url) {
    try {
      SafePaths.checkHttps(url);
      return "ok";
    } catch (SafePaths.Refused refused) {
      return refused.code;
    }
  }

  /** Word Lookup's folders, as LookupFilesPackage gives them. */
  private static final SafePaths.Roots LOOKUP = SafePaths.Roots.plugin("t2obvupqt3edmnrr", "Lookup");

  private static String codeOfPath(String path) {
    return codeOfPath(path, LOOKUP);
  }

  private static String codeOfPath(String path, SafePaths.Roots roots) {
    try {
      roots.check(path);
      return "ok";
    } catch (SafePaths.Refused refused) {
      return refused.code;
    }
  }

  /** A link inside a root that points out of it is refused; one that stays inside is accepted. */
  private static void symlinkOut() {
    try {
      java.nio.file.Path base = java.nio.file.Files.createTempDirectory("safepaths");
      java.nio.file.Path root = java.nio.file.Files.createDirectory(base.resolve("root"));
      java.nio.file.Path outside = java.nio.file.Files.createDirectory(base.resolve("outside"));
      java.nio.file.Files.createDirectory(root.resolve("inside"));
      java.nio.file.Files.createSymbolicLink(root.resolve("out"), outside);
      java.nio.file.Files.createSymbolicLink(root.resolve("in"), root.resolve("inside"));
      SafePaths.Roots roots = SafePaths.Roots.of(root.toString());
      check(codeOfPath(root + "/inside/a.png", roots).equals("ok"), "a file in the root accepted");
      check(codeOfPath(root + "/in/a.png", roots).equals("ok"), "a link that stays in the root accepted");
      check(codeOfPath(root + "/out/a.png", roots).equals("OUTSIDE_ROOTS"), "a link out of the root refused");
      check(codeOfPath(outside + "/a.png", roots).equals("OUTSIDE_ROOTS"), "the link's target refused");
    } catch (java.io.IOException failed) {
      check(false, "symlink fixture: " + failed);
    }
  }

  public static void main(String[] args) {
    // Shared storage is written in place: PluginHost counts a rename over a file as a delete (#62).
    check(SafePaths.isShared(new java.io.File("/storage/emulated/0/MyStyle/Lookup/library/library.json")), "MyStyle is shared");
    check(!SafePaths.isShared(new java.io.File("/data/user/0/com.ratta.supernote.pluginhost/files/plugins/x/thumbs/a")), "the plugin folder is private");
    check(codeOfUrl("https://openclipart.org/image/400px/1").equals("ok"), "https accepted");
    check(codeOfUrl("HTTPS://openclipart.org/").equals("ok"), "scheme case ignored");
    check(codeOfUrl("http://openclipart.org/").equals("HTTPS_ONLY"), "http refused");
    check(codeOfUrl("file:///etc/passwd").equals("HTTPS_ONLY"), "file refused");
    check(codeOfUrl(null).equals("HTTPS_ONLY"), "null url refused");
    // The allowlist (owner, 2026-11-26, #302): the plugin's private folder, EXPORT and its own
    // folder under MyStyle; every other path is refused.
    check(codeOfPath("/data/user/0/com.ratta.supernote.pluginhost/files/plugins/t2obvupqt3edmnrr/thumbs/a.png").equals("ok"), "the private folder accepted");
    check(codeOfPath("/data/data/com.ratta.supernote.pluginhost/files/plugins/t2obvupqt3edmnrr/search-cache.json").equals("ok"), "the private folder's other spelling accepted");
    check(codeOfPath("/data/user/0/com.ratta.supernote.pluginhost/files/plugins/t2obvupqt3edmnrr").equals("ok"), "the private folder itself accepted");
    check(codeOfPath("/storage/emulated/0/EXPORT/words.txt").equals("ok"), "EXPORT accepted");
    check(codeOfPath("/storage/emulated/0/MyStyle/Lookup/settings.json").equals("ok"), "the plugin's MyStyle folder accepted");
    check(SafePaths.isShared(new java.io.File("/storage/emulated/0/MyStyle/Lookup/settings.json")), "Lookup's folder is shared");
    check(codeOfPath("/data/user/0/com.ratta.supernote.pluginhost/files/plugins/l5m9ev3xmshh37u8/work/a.png").equals("OUTSIDE_ROOTS"), "another plugin's private folder refused");
    check(codeOfPath("/storage/emulated/0/MyStyle/Retouch/debug/a.png").equals("OUTSIDE_ROOTS"), "another plugin's MyStyle folder refused");
    check(codeOfPath("/storage/emulated/0/MyStyle/LookupOther/a.png").equals("OUTSIDE_ROOTS"), "a folder that only starts like the plugin's refused");
    check(codeOfPath("/storage/emulated/0/MyStyle/a.png").equals("OUTSIDE_ROOTS"), "MyStyle itself refused");
    check(codeOfPath("/storage/emulated/0/Note/a.note").equals("OUTSIDE_ROOTS"), "Note refused");
    check(codeOfPath("/sdcard/.data/dictionary/default/pt_BR").equals("OUTSIDE_ROOTS"), "the language file refused");
    check(codeOfPath("/etc/passwd").equals("OUTSIDE_ROOTS"), "a system file refused");
    check(codeOfPath("/storage/emulated/0/MyStyle/Lookup/../Retouch/settings.json").equals("BAD_PATH"), "an escape from Lookup's folder refused");
    check(codeOfPath("/storage/emulated/0/EXPORT/../Note/a.note").equals("BAD_PATH"), "an escape from EXPORT refused");
    check(codeOfPath("MyStyle/a.png").equals("BAD_PATH"), "relative refused");
    check(codeOfPath("/storage/../etc/a").equals("BAD_PATH"), "dot-dot refused");
    check(codeOfPath("/storage/./a").equals("BAD_PATH"), "dot refused");
    check(codeOfPath("/storage//a").equals("BAD_PATH"), "empty segment refused");
    check(codeOfPath("/storage/folder/").equals("BAD_PATH"), "folder refused");
    check(codeOfPath(null).equals("BAD_PATH"), "null path refused");
    check(LOOKUP.folders().contains(SafePaths.EXPORT), "EXPORT is a root");
    check(SafePaths.Roots.of("/a/").folders().get(0).equals("/a"), "a root's trailing slash dropped");
    symlinkOut();
    check(SafePaths.partFile(new File("/a/b.png")).getPath().equals("/a/b.png.part"), "part file");
    check(SafePaths.MAX_DOWNLOAD_BYTES == 20L * 1024 * 1024, "size cap");
    if (failures > 0) {
      System.err.println(failures + " failed");
      System.exit(1);
    }
    System.out.println("SafePathsTest: all passed");
  }
}
