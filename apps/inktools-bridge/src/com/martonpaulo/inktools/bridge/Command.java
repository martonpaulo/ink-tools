package com.martonpaulo.inktools.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * One request from {@code adb shell am broadcast}, validated before anything reaches PluginHost
 * (#215). No Android import: the receiver hands over the intent's extras as plain values.
 *
 * <pre>
 *   --es op install --es path /sdcard/MyStyle/X.snplg
 *   --es op enable  --es pluginID ID        (or disable, uninstall)
 *   --es op allow   --es pluginID ID --es perm A,B [--ei status 2]
 *   --es op ping
 * </pre>
 */
public final class Command {
  public enum Op { PING, INSTALL, ENABLE, DISABLE, UNINSTALL, ALLOW }

  /** PluginPermissionManager.STATUS_ALWAYS, «Always Allow». */
  public static final int STATUS_ALWAYS = 2;
  /** STATUS_CANCELLED to STATUS_ALWAYS: the values PluginHost knows. */
  private static final int STATUS_LOWEST = -1;
  /** Only the shared storage: PluginHost opens the path itself, with its own rights. */
  private static final Pattern SHARED_PATH = Pattern.compile("^/(sdcard|storage/emulated/0)/.+\\.snplg$");
  private static final Pattern PLUGIN_ID = Pattern.compile("^[A-Za-z0-9._-]+$");
  private static final Pattern PERMISSION = Pattern.compile("^[A-Za-z0-9._:-]+$");

  public final Op op;
  public final String path;
  public final String pluginId;
  public final List<String> permissions;
  public final int status;

  private Command(Op op, String path, String pluginId, List<String> permissions, int status) {
    this.op = op;
    this.path = path;
    this.pluginId = pluginId;
    this.permissions = permissions;
    this.status = status;
  }

  /** Throws IllegalArgumentException with a message for the shell when a value is missing or wrong. */
  public static Command parse(String op, String path, String pluginId, String perm, Integer status) {
    if (op == null) {
      throw new IllegalArgumentException("missing --es op: ping, install, enable, disable, uninstall or allow");
    }
    Op parsed;
    try {
      parsed = Op.valueOf(op.trim().toUpperCase(java.util.Locale.ROOT));
    } catch (IllegalArgumentException error) {
      throw new IllegalArgumentException("unknown op " + op + ": ping, install, enable, disable, uninstall or allow");
    }
    List<String> none = Collections.emptyList();
    switch (parsed) {
      case PING:
        return new Command(parsed, null, null, none, 0);
      case INSTALL:
        if (path == null || path.contains("/../") || !SHARED_PATH.matcher(path).matches()) {
          throw new IllegalArgumentException("--es path must be an absolute .snplg path under /sdcard: " + path);
        }
        return new Command(parsed, path, null, none, 0);
      case ALLOW:
        int wanted = status == null ? STATUS_ALWAYS : status;
        if (wanted < STATUS_LOWEST || wanted > STATUS_ALWAYS) {
          throw new IllegalArgumentException("--ei status must be -1, 0, 1 or 2: " + wanted);
        }
        return new Command(parsed, null, id(pluginId), permissions(perm), wanted);
      default:
        return new Command(parsed, null, id(pluginId), none, 0);
    }
  }

  private static String id(String pluginId) {
    if (pluginId == null || !PLUGIN_ID.matcher(pluginId).matches()) {
      throw new IllegalArgumentException("--es pluginID must be a plugin id: " + pluginId);
    }
    return pluginId;
  }

  private static List<String> permissions(String perm) {
    List<String> found = new ArrayList<>();
    for (String name : perm == null ? new String[0] : perm.split(",")) {
      String trimmed = name.trim();
      if (trimmed.isEmpty()) {
        continue;
      }
      if (!PERMISSION.matcher(trimmed).matches()) {
        throw new IllegalArgumentException("not a permission name: " + trimmed);
      }
      found.add(trimmed);
    }
    if (found.isEmpty()) {
      throw new IllegalArgumentException("--es perm needs one or more names, comma-separated");
    }
    return Collections.unmodifiableList(found);
  }
}
