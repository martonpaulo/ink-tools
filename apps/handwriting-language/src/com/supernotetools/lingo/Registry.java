package com.supernotetools.lingo;

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
      new Item("handwriting.language-file", 2, "user", "handwriting-language", null, "#293 adds a read of the folder's one file", "handwriting-language AndroidFiles.java", null),
      new Item("handwriting.changed-broadcast", 3, "user", "handwriting-language", null, "sending it is the change itself", "handwriting-language Switcher.java", null),
      new Item("handwriting.writing-screens", 3, "user", "handwriting-language", null, "#293 adds a resolve of each activity name", "handwriting-language ButtonRule.java", null),
      new Item("settings.language-page", 3, "user", "handwriting-language", null, "#293 adds a resolve of the activity without starting it", "handwriting-language SettingsActivity.java", null)));

  /** The handwriting recognition language: one empty file named for the code in .data/dictionary/default/ (handwriting.language-file). */
  public static final class HandwritingLanguageFile {
    public static final String FOLDER = ".data/dictionary";
    public static final String CURRENT = "default";
    public static final String PACKS = "resources";
    public static final String EMPTY_FOLDER_LANGUAGE = "en_US";

    private HandwritingLanguageFile() {}
  }

  /** The broadcast Settings sends after a language change (handwriting.changed-broadcast). */
  public static final class HandwritingChangedBroadcast {
    public static final String ACTION = "hw_type_change";

    private HandwritingChangedBroadcast() {}
  }

  /** The screens that take handwriting, by activity class name, and the package whose overlay window is a plugin view, never one (handwriting.writing-screens). */
  public static final class HandwritingWritingScreens {
    public static final List<String> ACTIVITIES = Collections.unmodifiableList(Arrays.asList("NoteInsidePagesActivity", "KnowledgeActivity", "TaskActivity", "HomeActivity"));
    public static final String PLUGIN_VIEW_PACKAGE = "com.ratta.supernote.pluginhost";

    private HandwritingWritingScreens() {}
  }

  /** The Settings app's activity and the extra that opens its handwriting language page (settings.language-page). */
  public static final class SettingsLanguagePage {
    public static final String PACKAGE = "com.ratta.settings";
    public static final String ACTIVITY = "com.ratta.settings.SettingsActivity";
    public static final String PAGE_EXTRA = "activity_type";
    public static final String LANGUAGE_PAGE = "com.ratta.settings.input.HWLanguageSetting";

    private SettingsLanguagePage() {}
  }

  private Registry() {}
}
