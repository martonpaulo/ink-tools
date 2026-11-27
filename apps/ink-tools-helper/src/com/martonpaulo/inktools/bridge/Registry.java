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
    /** The kill switch: why the module is off and until when it is reviewed; null when it is on (#293). */
    public final String off;

    Item(String id, int level, String impact, String owner, String probe, String unprobed, String active, String off) {
      this.id = id;
      this.level = level;
      this.impact = impact;
      this.owner = owner;
      this.probe = probe;
      this.unprobed = unprobed;
      this.active = active;
      this.off = off;
    }
  }

  /** Every item of the registry, for the firmware watch (#293). */
  public static final List<Item> ITEMS = Collections.unmodifiableList(Arrays.asList(
      new Item("calendar.provider", 2, "user", "sn-adapter", "sn-adapter probeCapability(calendar)", null, "sn-adapter internals/calendar.ts", null),
      new Item("calendar.reading-rules", 5, "user", "sn-adapter", null, "a row's visibility shows only on the screen; the effect test is the device round (#293 adds a read round-trip on a known row)", "sn-adapter internals/calendar.ts", null),
      new Item("calendar.sync-broadcast", 3, "user", "inkctl", "inkctl routes", null, "inkctl sync calendar", null),
      new Item("diagnostics.provider-probes", 2, "tests", "ink-tools-probe", "ink-tools-probe Run Probe", null, "ink-tools-probe native ProbeTargets.java", null),
      new Item("digest.provider", 2, "user", "sn-adapter", "sn-adapter probeCapability(digest)", null, "sn-adapter internals/digest.ts", null),
      new Item("handwriting.language-file", 2, "user", "handwriting-language", null, "#293 adds a read of the folder's one file", "handwriting-language AndroidFiles.java", null),
      new Item("handwriting.changed-broadcast", 3, "user", "handwriting-language", null, "sending it is the change itself", "handwriting-language Switcher.java", null),
      new Item("handwriting.writing-screens", 3, "user", "handwriting-language", null, "#293 adds a resolve of each activity name", "handwriting-language ButtonRule.java", null),
      new Item("note.activity", 3, "tests", "inkctl", "inkctl routes", null, "inkctl note open and note new", null),
      new Item("note.screen-ids", 4, "tests", "inkctl", null, "finding the controls is the test itself", "inkctl", null),
      new Item("note.fonts-folder", 5, "user", "inkctl", null, "the font menu shows only on the screen", "inkctl font install", null),
      new Item("notefile.format-versions", 2, "user", "note-editor", null, "#293 adds a parse of a fixture note per firmware", "note-editor NoteFile.swift", null),
      new Item("notefile.writer-byte-edit", 5, "user", "note-editor", null, "a written note is checked by opening it on the tablet", "note-editor NoteWriter.swift", null),
      new Item("pen.digitizer-units", 5, "user", "sn-adapter", null, "needs a pen stroke; the effect test is the Smart Pen device round", "sn-adapter official/elements.ts", null),
      new Item("pen.pen-types", 5, "user", "smart-pen", null, "needs a pen stroke and a lasso; the effect test is the Smart Pen device round", "smart-pen src/modules/shapes/guard.ts", null),
      new Item("pen.replay-route", 1, "tests", "sn-adapter", null, "needs one real-pen recording; the effect test is Smart Pen's replay in the device round (#298)", "sn-adapter official/penTape.ts", null),
      new Item("plugin-api.element-reads", 5, "user", "sn-adapter", null, "a probe would have to hang the host to see the limit", "sn-adapter official/elements.ts", null),
      new Item("plugin-api.unregister-unknown-button", 5, "user", "sn-adapter", null, "a probe would hang the plugin", "sn-adapter official/buttons.ts", null),
      new Item("plugin-api.pen-up-uuid", 5, "user", "smart-pen", null, "needs a pen stroke; the effect test is the Smart Pen device round", "smart-pen src/modules/text/device.ts", null),
      new Item("plugin-api.crop-erase-elements", 5, "user", "image-editing", null, "needs a picture on a note page; the effect test is the Image Editing device round", "image-editing src/edit.ts", null),
      new Item("plugin-api.inserted-picture-copy", 5, "user", "image-editing", null, "needs a picture insert on a note page", "image-editing src/edit.ts", null),
      new Item("plugin-api.floating-insert", 5, "user", "device-link", null, "needs a picture insert on a note page", "device-link src/receive/receive.ts", null),
      new Item("plugin-api.batch-no-redraw", 5, "user", "sn-adapter", null, "needs a conversion on a note page; the effect test is the Smart Pen device round (#296)", "sn-adapter official/elements.ts", null),
      new Item("pluginhost.no-back-press", 5, "user", "ui-kit", null, "needs a key press on the tablet", "ui-kit src/backKey.ts", null),
      new Item("pluginhost.overlay-back-key", 5, "user", "image-editing", null, "needs a key press on the tablet", "sn-adapter native BackKeyModule.java, registered by every plugin with a full view", null),
      new Item("pluginhost.file-sandbox", 5, "user", "picture-search", null, "#293 adds a write and delete of a test file in each allowed folder", "picture-search native SafePaths.java", null),
      new Item("pluginhost.plugin-list", 2, "tests", "inkctl", "inkctl routes", null, "inkctl plugin list", null),
      new Item("pluginhost.setting-service", 3, "tests", "ink-tools-helper", "ink-tools-helper ping", null, "ink-tools-helper HostCalls.java", null),
      new Item("pluginhost.call-numbers", 5, "tests", "ink-tools-helper", "ink-tools-helper call-number check", null, "ink-tools-helper HostCalls.java", null),
      new Item("pluginhost.parcel-classes", 3, "tests", "ink-tools-helper", "ink-tools-helper ping", null, "ink-tools-helper HostClasses.java", null),
      new Item("pluginhost.permission-status", 5, "tests", "ink-tools-helper", null, "a probe would change a plugin's permission", "ink-tools-helper Command.java", null),
      new Item("pluginhost.host-dialogs", 5, "user", "sn-adapter", null, "a dialog waits for a press on the tablet; the effect test is the #296 device round", "sn-adapter official/dialog.ts", null),
      new Item("settings.language-page", 3, "user", "handwriting-language", null, "#293 adds a resolve of the activity without starting it", "handwriting-language SettingsActivity.java", null),
      new Item("settings.plugin-install-screens", 4, "tests", "inkctl", null, "walking the screens is the test itself", "inkctl plugin install", null),
      new Item("settings.plugin-detail-labels", 4, "tests", "inkctl", null, "walking the screens is the test itself", "inkctl plugin allow and uninstall", null),
      new Item("storage.cloud-conflict-folder", 5, "user", "picture-search", null, "a conflict appears only after two devices sync", "picture-search src/storage/settings.ts", null),
      new Item("storage.sign-in-drop-folder", 2, "user", "account-sync", null, "#293 adds a read of the folder", "account-sync src/secretStore.ts", null),
      new Item("storage.helper-channel", 2, "tests", "ink-tools-probe", "inkctl helper", null, "ink-tools-probe src/helper.ts", null),
      new Item("system.device-identity", 2, "user", "inkctl", "inkctl status", null, "inkctl status", null),
      new Item("system.firmware-page", 2, "user", "inkctl", "inkctl firmware", null, "inkctl firmware", null),
      new Item("system.plugin-log-tag", 5, "tests", "inkctl", "inkctl logs", null, "inkctl logs", null),
      new Item("todo.provider", 2, "user", "sn-adapter", "sn-adapter probeCapability(todo)", null, "sn-adapter internals/todo.ts", null),
      new Item("todo.row-rules", 5, "user", "sn-adapter", null, "a row's visibility shows only in the app; #293 adds a read round-trip on a known row", "sn-adapter internals/rules.ts", null),
      new Item("todo.twin-repair", 5, "user", "account-sync", null, "a twin appears only after a cloud sync; the accepted risk is a real task soft-deleted, so the repair logs each removal", "account-sync deviceStores.ts", null),
      new Item("todo.sync-trigger", 5, "tests", "inkctl", "inkctl routes", null, "inkctl sync tasks", null),
      new Item("ui.measured-tokens", 5, "user", "ui-kit", null, "a look is checked by a side-by-side screenshot in a device round (#299)", "ui-kit src/tokens.json", null)));

  /** The Calendar provider's authority, tables and columns (calendar.provider). */
  public static final class CalendarProvider {
    public static final String AUTHORITY = "com.ratta.supernote.calendar.provider";
    public static final String EVENTS_URI = "content://com.ratta.supernote.calendar.provider/data_info";
    public static final String CONFIG_URI = "content://com.ratta.supernote.calendar.provider/config_info";

    private CalendarProvider() {}
  }

  /** The Digest provider's authority, table, paths and limits (digest.provider). */
  public static final class DigestProvider {
    public static final String AUTHORITY = "com.ratta.supernote.knowledge.provider";
    public static final String KNOWLEDGE_URI = "content://com.ratta.supernote.knowledge.provider/knowledge";

    private DigestProvider() {}
  }

  /** PluginHost's private PluginSettingService and its binder descriptors (pluginhost.setting-service). */
  public static final class PluginhostSettingService {
    public static final String HOST_PACKAGE = "com.ratta.supernote.pluginhost";
    public static final String SERVICE = "com.ratta.supernote.pluginhost.services.PluginSettingService";
    public static final String DESCRIPTOR = "com.ratta.supernote.plugincorelib.IPluginSetting";
    public static final String CALLBACK_PACKAGE = "com.ratta.supernote.plugincorelib.callback.";
    public static final String INSTALL_CALLBACK = "IPluginInstallCallback";
    public static final String SET_CALLBACK = "IPluginSetCallback";
    public static final String UNINSTALL_CALLBACK = "IPluginUninstallCallback";

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

  /** The permission status values: -1 the lowest (cancelled), 2 Always Allow (pluginhost.permission-status). */
  public static final class PluginhostPermissionStatus {
    public static final int ALWAYS = 2;
    public static final int LOWEST = -1;

    private PluginhostPermissionStatus() {}
  }

  /** The model from ro.product.board, and the vendor package prefix (system.device-identity). */
  public static final class SystemDeviceIdentity {
    public static final String BOARD_PROPERTY = "ro.product.board";
    public static final List<String> BOARDS = Collections.unmodifiableList(Arrays.asList("A5X2", "A6X2"));
    public static final List<String> MODELS = Collections.unmodifiableList(Arrays.asList("Manta", "Nomad"));
    public static final String VENDOR_PACKAGE_PREFIX = "com.ratta.";

    private SystemDeviceIdentity() {}
  }

  /** The To-Do provider's authority, tables and columns (todo.provider). */
  public static final class TodoProvider {
    public static final String AUTHORITY = "com.ratta.supernote.task.provider";
    public static final String TASKS_URI = "content://com.ratta.supernote.task.provider/tasks_table";
    public static final String GROUPS_URI = "content://com.ratta.supernote.task.provider/task_group_table";

    private TodoProvider() {}
  }

  private Registry() {}
}
