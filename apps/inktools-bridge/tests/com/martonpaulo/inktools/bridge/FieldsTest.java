package com.martonpaulo.inktools.bridge;

/** Plain JVM test, no framework: run by `node scripts/build.cjs --test`. */
public final class FieldsTest {
  /** Shaped like PluginHost's parcelables: one with setters, one with bare fields in a parent. */
  public static final class WithSetters {
    private String pluginID;
    private boolean enable;

    public void setPluginID(String value) {
      pluginID = "set:" + value;
    }

    public void setEnable(boolean value) {
      enable = value;
    }
  }

  static class Parent {
    private int status;
  }

  static final class Bare extends Parent {
    private String name;
    private static final int IGNORED = 7;
  }

  public static void main(String[] args) {
    WithSetters info = new WithSetters();
    Fields.set(info, "pluginID", "abc");
    Fields.set(info, "enable", true);
    check(info.pluginID.equals("set:abc") && info.enable, "a setter wins");

    Bare permission = new Bare();
    Fields.set(permission, "name", "plugin.permission.FILE:READ");
    Fields.set(permission, "status", 2);
    check(permission.name.equals("plugin.permission.FILE:READ") && ((Parent) permission).status == 2,
        "a bare field is set, in the class or its parent");
    check(Fields.describe(permission).equals("Bare{name=plugin.permission.FILE:READ, status=2}"),
        "describe lists instance fields only: " + Fields.describe(permission));
    check(Fields.describe(null).equals("null"), "describe takes null");
    try {
      Fields.set(permission, "status", "two");
      throw new AssertionError("a value of the wrong type must be refused");
    } catch (IllegalStateException expected) {
      // refused
    }
    try {
      Fields.set(permission, "missing", 1);
      throw new AssertionError("a missing field must be refused");
    } catch (IllegalStateException expected) {
      // refused
    }
    System.out.println("FieldsTest ok" + (Bare.IGNORED > 0 ? "" : ""));
  }

  static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
