package com.inktools.files;

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

  /** The items this app reads. */
  public static final List<Item> ITEMS = Collections.unmodifiableList(Arrays.asList(
      new Item("pluginhost.file-sandbox", 5, "user", "picture-search", null, "#293 adds a write and delete of a test file in each allowed folder", "picture-search native SafePaths.java", null),
      new Item("storage.cloud-conflict-folder", 5, "user", "picture-search", null, "a conflict appears only after two devices sync", "picture-search src/storage/settings.ts", null),
      new Item("storage.sign-in-drop-folder", 2, "user", "account-sync", null, "#293 adds a read of the folder", "account-sync src/secretStore.ts", null),
      new Item("storage.shared-folder", 2, "user", "sn-adapter", "sn-adapter probeSharedFolder", null, "sn-adapter src/official/storage.ts", null)));

  /** PluginHost's file rules: a plugin writes only in its private folder and the shared MyStyle folder; picture-search's module allows only the plugin's own folders; the built-in Sticker plugin keeps its library in its own private folder, and its Import lists sticker collections, ZIP files with the stickerCollectionExtension that hold .sticker files, from stickerCollectionFolder; a sticker path in one of the stickerImportFolders is moved to the plugin's own folder (pluginhost.file-sandbox). */
  public static final class PluginhostFileSandbox {
    public static final String SHARED_ROOT = "/storage/emulated/0";
    public static final String SHARED_FOLDER = "MyStyle";
    public static final String EXPORT_FOLDER = "EXPORT";
    public static final String HIDDEN_FOLDER = ".data/plugin";
    public static final List<String> PRIVATE_HOMES = Collections.unmodifiableList(Arrays.asList("/data/data/com.ratta.supernote.pluginhost/files/plugins", "/data/user/0/com.ratta.supernote.pluginhost/files/plugins"));
    public static final String STICKER_COLLECTION_EXTENSION = "snstk";
    public static final String STICKER_COLLECTION_FOLDER = "EXPORT";
    public static final List<String> STICKER_IMPORT_FOLDERS = Collections.unmodifiableList(Arrays.asList("Document", "EXPORT", "MyStyle", "Note", "SCREENSHOT", "INBOX"));

    private PluginhostFileSandbox() {}
  }

  /** Supernote Cloud renames a folder it cannot merge to <folder>_CONFLICT_<17 digits> (storage.cloud-conflict-folder). */
  public static final class StorageCloudConflictFolder {
    public static final String MARKER = "_CONFLICT_";
    public static final int DIGITS = 17;

    private StorageCloudConflictFolder() {}
  }

  /** Account Sync's sign-in drop folder in .data/plugin/ (storage.sign-in-drop-folder). */
  public static final class StorageSignInDropFolder {
    public static final String FOLDER = "/storage/emulated/0/.data/plugin/inktools-account-sync";

    private StorageSignInDropFolder() {}
  }

  /** The Ink Tools shared folder in .data/plugin/, where every Ink Tools plugin reads and writes the values the tools share (storage.shared-folder). */
  public static final class StorageSharedFolder {
    public static final String FOLDER = "/storage/emulated/0/.data/plugin/inktools-shared";
    public static final List<String> PERMISSIONS = Collections.unmodifiableList(Arrays.asList("plugin.permission.FILE:READ", "plugin.permission.FILE:WRITE"));

    private StorageSharedFolder() {}
  }

  private Registry() {}
}
