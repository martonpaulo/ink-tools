package com.martonpaulo.inktools.bridge;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** The registry of Supernote internals this app reads. Written by scripts/registry.py from registry/ (#294); never edit it by hand. */
public final class Registry {
  public static final String VERSION = "2026.11.25";

  /** One registry item: docs/architecture.md › Layer rules gives the levels. */
  public static final class Item {
    public final String id;
    public final int level;
    public final String impact;
    public final String owner;
    /** The probe's name; null when the item is unprobed. */
    public final String probe;
    /** Why no safe probe exists yet; null when the item has a probe. */
    public final String unprobed;
    public final String active;

    Item(String id, int level, String impact, String owner, String probe, String unprobed, String active) {
      this.id = id;
      this.level = level;
      this.impact = impact;
      this.owner = owner;
      this.probe = probe;
      this.unprobed = unprobed;
      this.active = active;
    }
  }

  public static final List<Item> ITEMS = Collections.unmodifiableList(Arrays.asList(
      new Item("pluginhost.setting-service", 3, "tests", "inktools-bridge", "inktools-bridge ping", null, "inktools-bridge HostCalls.java"),
      new Item("pluginhost.call-numbers", 5, "tests", "inktools-bridge", "inktools-bridge call-number check", null, "inktools-bridge HostCalls.java"),
      new Item("pluginhost.parcel-classes", 3, "tests", "inktools-bridge", "inktools-bridge ping", null, "inktools-bridge HostClasses.java"),
      new Item("pluginhost.permission-status", 5, "tests", "inktools-bridge", null, "a probe would change a plugin's permission", "inkctl plugin allow")));

  /** PluginHost's private PluginSettingService and its binder descriptors (pluginhost.setting-service). */
  public static final class PluginhostSettingService {
    public static final String HOST_PACKAGE = "com.ratta.supernote.pluginhost";
    public static final String SERVICE = "com.ratta.supernote.pluginhost.services.PluginSettingService";
    public static final String DESCRIPTOR = "com.ratta.supernote.plugincorelib.IPluginSetting";
    public static final String CALLBACK_PACKAGE = "com.ratta.supernote.plugincorelib.callback.";

    private PluginhostSettingService() {}
  }

  /** The transaction numbers of IPluginSetting's four calls (pluginhost.call-numbers). */
  public static final class PluginhostCallNumbers {
    public static final int INSTALL = 1;
    public static final int UNINSTALL = 5;
    public static final int SET_ENABLE = 6;
    public static final int UPDATE_PERMISSIONS = 9;
    public static final String INSTALL_METHOD = "installPlugin";
    public static final String UNINSTALL_METHOD = "uninstallPlugin";
    public static final String SET_ENABLE_METHOD = "setPluginEnable";
    public static final String UPDATE_PERMISSIONS_METHOD = "updatePluginPermissions";

    private PluginhostCallNumbers() {}
  }

  /** PluginHost's PluginInfo and PluginPermission classes, loaded by reflection, and the fields set on them (pluginhost.parcel-classes). */
  public static final class PluginhostParcelClasses {
    public static final String PLUGIN_ID_FIELD = "pluginID";
    public static final String ENABLE_FIELD = "enable";
    public static final String PERMISSION_NAME_FIELD = "name";
    public static final String PERMISSION_STATUS_FIELD = "status";

    private PluginhostParcelClasses() {}
  }

  /** The permission status values; 2 is Always Allow (pluginhost.permission-status). */
  public static final class PluginhostPermissionStatus {
    public static final int ALWAYS = 2;

    private PluginhostPermissionStatus() {}
  }

  private Registry() {}
}
