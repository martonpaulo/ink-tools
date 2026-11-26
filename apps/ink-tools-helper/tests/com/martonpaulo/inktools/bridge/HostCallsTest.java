package com.martonpaulo.inktools.bridge;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Plain JVM test, no framework: run by `node scripts/build.cjs --test`. The encoding of #215. */
public final class HostCallsTest {
  /** Records each write as one line, so a call reads as its parcel layout. */
  static final class Recorder implements HostCalls.Wire {
    final List<String> writes = new ArrayList<>();

    @Override
    public void writeInterfaceToken(String descriptor) {
      writes.add("token " + descriptor);
    }

    @Override
    public void writeString(String value) {
      writes.add("string " + value);
    }

    @Override
    public void writeInt(int value) {
      writes.add("int " + value);
    }

    @Override
    public void writeStrongBinder(Object binder) {
      writes.add("binder " + binder);
    }

    @Override
    public void writeBody(Object parcelable) {
      writes.add("body " + parcelable);
    }
  }

  public static void main(String[] args) {
    killSwitch();
    String token = "token com.ratta.supernote.plugincorelib.IPluginSetting";
    check(HostCalls.DESCRIPTOR.equals("com.ratta.supernote.plugincorelib.IPluginSetting"), "the descriptor is PluginHost's");
    check(HostCalls.SERVICE.equals("com.ratta.supernote.pluginhost.services.PluginSettingService"), "the service is PluginHost's");
    check(HostCalls.INSTALL_CALLBACK.equals("com.ratta.supernote.plugincorelib.callback.IPluginInstallCallback"),
        "the install callback descriptor is PluginHost's, in the callback package");
    check(HostCalls.SET_CALLBACK.equals("com.ratta.supernote.plugincorelib.callback.IPluginSetCallback"),
        "the set callback descriptor is PluginHost's, in the callback package");
    check(HostCalls.UNINSTALL_CALLBACK.equals("com.ratta.supernote.plugincorelib.callback.IPluginUninstallCallback"),
        "the uninstall callback descriptor is PluginHost's, in the callback package");

    Recorder install = new Recorder();
    check(HostCalls.install(install, "/sdcard/MyStyle/X.snplg", "cb") == 1, "installPlugin is transaction 1");
    check(install.writes.equals(Arrays.asList(token, "string /sdcard/MyStyle/X.snplg", "binder cb")),
        "installPlugin writes the path, then the callback: " + install.writes);

    Recorder enable = new Recorder();
    check(HostCalls.setEnable(enable, "info", "cb") == 6, "setPluginEnable is transaction 6");
    check(enable.writes.equals(Arrays.asList(token, "int 1", "body info", "binder cb")),
        "setPluginEnable writes a non-null PluginInfo, then the callback: " + enable.writes);

    Recorder uninstall = new Recorder();
    check(HostCalls.uninstall(uninstall, "info", "cb") == 5, "uninstallPlugin is transaction 5");
    check(uninstall.writes.equals(Arrays.asList(token, "int 1", "body info", "binder cb")),
        "uninstallPlugin writes a non-null PluginInfo, then the callback: " + uninstall.writes);

    Recorder nothing = new Recorder();
    HostCalls.setEnable(nothing, null, "cb");
    check(nothing.writes.equals(Arrays.asList(token, "int 0", "binder cb")), "a null parcelable is the int 0 alone");

    Recorder allow = new Recorder();
    check(HostCalls.updatePermissions(allow, "abc", Arrays.asList("read", "write")) == 9, "updatePluginPermissions is transaction 9");
    check(allow.writes.equals(Arrays.asList(token, "string abc", "int 2", "int 1", "body read", "int 1", "body write")),
        "updatePluginPermissions writes the id, the list size, then each permission: " + allow.writes);

    Recorder empty = new Recorder();
    HostCalls.updatePermissions(empty, "abc", Collections.emptyList());
    check(empty.writes.equals(Arrays.asList(token, "string abc", "int 0")), "an empty list is its size alone");
    System.out.println("HostCallsTest ok");
  }

  /** A host call reads its items' kill switches first; any one off stops it, other items do not (#293). */
  static void killSwitch() {
    check(HostCalls.turnedOff(Registry.ITEMS) == null, "every host call item is on in the registry");
    for (String id : HostCalls.CALL_ITEMS) {
      InternalFailure.item(id);
    }
    List<Registry.Item> items = new ArrayList<>(Registry.ITEMS);
    Registry.Item other = InternalFailure.item("todo.provider");
    items.set(items.indexOf(other), new Registry.Item(other.id, other.level, other.impact, other.owner, other.probe,
        other.unprobed, other.active, "until 2026-12-31: another module"));
    check(HostCalls.turnedOff(items) == null, "an item outside the host calls does not stop them");
    Registry.Item numbers = InternalFailure.item("pluginhost.call-numbers");
    items.set(items.indexOf(numbers), new Registry.Item(numbers.id, numbers.level, numbers.impact, numbers.owner,
        numbers.probe, numbers.unprobed, numbers.active, "until 2026-12-31: the numbers moved"));
    check(HostCalls.turnedOff(items).id.equals("pluginhost.call-numbers"), "the call numbers turned off stop every host call");
    check(Copy.FAILURES.containsKey(Copy.TURNED_OFF), "the stop has its sentence");
  }

  static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
