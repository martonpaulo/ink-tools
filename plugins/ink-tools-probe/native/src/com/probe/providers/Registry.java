package com.probe.providers;

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
      new Item("calendar.provider", 2, "user", "sn-adapter", "sn-adapter probeCapability(calendar)", null, "sn-adapter internals/calendar.ts", null),
      new Item("diagnostics.provider-probes", 2, "tests", "ink-tools-probe", "ink-tools-probe Run Probe", null, "ink-tools-probe native ProbeTargets.java", null),
      new Item("digest.provider", 2, "user", "sn-adapter", "sn-adapter probeCapability(digest)", null, "sn-adapter internals/digest.ts", null),
      new Item("storage.helper-channel", 2, "tests", "ink-tools-probe", "inkctl helper", null, "ink-tools-probe src/helper.ts", null),
      new Item("todo.provider", 2, "user", "sn-adapter", "sn-adapter probeCapability(todo)", null, "sn-adapter internals/todo.ts", null)));

  /** The Calendar provider's authority, tables and columns (calendar.provider). */
  public static final class CalendarProvider {
    public static final String AUTHORITY = "com.ratta.supernote.calendar.provider";
    public static final String EVENTS_URI = "content://com.ratta.supernote.calendar.provider/data_info";
    public static final String CONFIG_URI = "content://com.ratta.supernote.calendar.provider/config_info";

    private CalendarProvider() {}
  }

  /** Ink Tools Probe's direct provider probes: the Digest root and digest paths, the control task and calendar rows (diagnostics.provider-probes). */
  public static final class DiagnosticsProviderProbes {
    public static final String DIGEST_ROOT_PATH = "";
    public static final String DIGEST_PATH = "digest";
    public static final String DIGEST_MARKER_COLUMN = "digest_content";

    private DiagnosticsProviderProbes() {}
  }

  /** The Digest provider's authority, table, paths and limits (digest.provider). */
  public static final class DigestProvider {
    public static final String AUTHORITY = "com.ratta.supernote.knowledge.provider";
    public static final String KNOWLEDGE_URI = "content://com.ratta.supernote.knowledge.provider/knowledge";

    private DigestProvider() {}
  }

  /** Ink Tools Probe's helper channel: MyStyle/Probe/command.json and SNPROBE log lines (storage.helper-channel). */
  public static final class StorageHelperChannel {
    public static final String FOLDER = "/storage/emulated/0/MyStyle/Probe";
    public static final String COMMAND_FILE = "command.json";
    public static final String ANSWER_MARK = "SNPROBE answer";

    private StorageHelperChannel() {}
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
