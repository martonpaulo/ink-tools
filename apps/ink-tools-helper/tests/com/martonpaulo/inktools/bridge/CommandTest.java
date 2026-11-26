package com.martonpaulo.inktools.bridge;

import java.util.Arrays;

/** Plain JVM test, no framework: run by `node scripts/build.cjs --test`. */
public final class CommandTest {
  public static void main(String[] args) {
    Command install = Command.parse("install", "/sdcard/MyStyle/X.snplg", null, null, null);
    check(install.op == Command.Op.INSTALL && install.path.equals("/sdcard/MyStyle/X.snplg"), "install keeps its path");
    check(Command.parse("INSTALL", "/storage/emulated/0/MyStyle/Y.snplg", null, null, null).op == Command.Op.INSTALL,
        "the op ignores case, and the long shared path works");
    for (String path : new String[] {null, "MyStyle/X.snplg", "/data/local/tmp/X.snplg", "/sdcard/X.zip", "/sdcard/a/../../data/X.snplg"}) {
      refused("install", path, null, null, null, "install refuses the path " + path);
    }

    check(Command.parse("enable", null, "abc.def_1", null, null).pluginId.equals("abc.def_1"), "enable keeps its id");
    check(Command.parse("disable", null, "abc", null, null).op == Command.Op.DISABLE, "disable parses");
    check(Command.parse("uninstall", null, "abc", null, null).op == Command.Op.UNINSTALL, "uninstall parses");
    refused("enable", null, null, null, null, "enable needs an id");
    refused("enable", null, "a b", null, null, "an id has no space");
    refused("enable", null, "a;rm", null, null, "an id has no shell character");

    Command allow = Command.parse("allow", null, "abc", "plugin.permission.FILE:READ, plugin.permission.FILE:WRITE", null);
    check(allow.permissions.equals(Arrays.asList("plugin.permission.FILE:READ", "plugin.permission.FILE:WRITE")),
        "allow splits the names: " + allow.permissions);
    check(allow.status == Command.STATUS_ALWAYS && Command.STATUS_ALWAYS == 2, "allow sets Always Allow, status 2, by default");
    check(Command.parse("allow", null, "abc", "x", 0).status == 0, "allow takes another status");
    refused("allow", null, "abc", "x", 3, "status 3 is not one PluginHost knows");
    refused("allow", null, "abc", " , ", null, "allow needs a permission");
    refused("allow", null, "abc", "a b", null, "a permission name has no space");

    check(Command.parse("ping", null, null, null, null).op == Command.Op.PING, "ping needs nothing");
    refused(null, null, null, null, null, "an op is required");
    refused("format", null, null, null, null, "an unknown op is refused");

    check(Outcome.of(Outcome.OK, "").data.equals("ok"), "a bare outcome is its word");
    check(Outcome.of(Outcome.FAILED, "a\n\"b\"").data.equals("failed a 'b'"), "an outcome stays on one line, without double quotes");
    check(Outcome.OK != 0 && Outcome.FAILED != 0, "0 stays what am prints when no receiver ran");

    check(Callbacks.succeeded("onSuccess", 9), "onSuccess is a success");
    check(!Callbacks.succeeded("onFailed", 1), "onFailed is a failure, whatever its code");
    check(Callbacks.succeeded(null, 1) && !Callbacks.succeeded(null, 2), "without names, the declared order decides");
    java.util.Map<String, Integer> codes = new java.util.HashMap<>();
    codes.put("onSuccess", 1);
    codes.put("onFailed", 2);
    check("onFailed".equals(Callbacks.method(codes, 2)) && Callbacks.method(codes, 3) == null, "a code maps to its method");
    System.out.println("CommandTest ok");
  }

  static void refused(String op, String path, String id, String perm, Integer status, String what) {
    try {
      Command.parse(op, path, id, perm, status);
    } catch (IllegalArgumentException expected) {
      return;
    }
    throw new AssertionError(what);
  }

  static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
