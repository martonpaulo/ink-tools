package com.probe.providers;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The providers the probe tries (#59): the Digest (Knowledge) provider under test and two
 * known-open providers as controls. The URIs and marker columns come from the sn-adapter
 * descriptor (packages/sn-adapter/src/internals/descriptor.json); keep the two in step.
 */
public final class ProbeTargets {
  /** Written into a dry insert and the only row the revert may delete. */
  public static final String MARKER = "SNPROBE dry insert";

  /**
   * The row key the revert deletes by (#213): the descriptor lists {@code id} among the columns of
   * {@code data_info} and {@code tasks_table}. The Digest table's key is not known; a revert there
   * that finds no {@code id} column fails with a FAILED line, never a silent pass.
   */
  public static final String ROW_ID = "id";

  /** One provider URI to query, and how to insert and revert one marked row. */
  public static final class Target {
    public final String label;
    public final String uri;
    /** Text column that holds {@link #MARKER}; the revert deletes, by row id, only rows where it equals it. */
    public final String markerColumn;
    /** Whether a dry insert is tried: false for the provider root, which has no table. */
    public final boolean writable;
    /** Whether the dry insert fills the Calendar's NOT NULL columns ({@link #calendarRow}). */
    final boolean calendar;

    Target(String label, String uri, String markerColumn, boolean writable) {
      this(label, uri, markerColumn, writable, false);
    }

    Target(String label, String uri, String markerColumn, boolean writable, boolean calendar) {
      this.label = label;
      this.uri = uri;
      this.markerColumn = markerColumn;
      this.writable = writable;
      this.calendar = calendar;
    }

    /** Every column of the dry insert, the marker included, for an insert at {@code now} (epoch ms). */
    public Map<String, Object> row(long now) {
      Map<String, Object> row = calendar ? calendarRow(now) : new LinkedHashMap<String, Object>();
      row.put(markerColumn, MARKER);
      return row;
    }
  }

  private static final long HOUR_MS = 60L * 60L * 1000L;

  /**
   * The control-calendar test event (#208): one hour from {@code now}, with every NOT NULL column of
   * {@code data_info} filled as Account Sync's dry insert fills it. The provider refuses a row
   * without one, naming one column at a time (#43). The column names and the tag, state and status
   * mirror the descriptor's {@code calendar.rules} ({@code requiredOnInsert}, {@code writeTag},
   * {@code writeState}, {@code writeStatus}); ProbeTargetsTest keeps them equal.
   */
  static Map<String, Object> calendarRow(long now) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("calendarId", MARKER);
    row.put("tag", "task");
    row.put("state", 0);
    row.put("readOnly", 1);
    row.put("isAllDay", 0);
    row.put("title", MARKER);
    row.put("startTime", now);
    row.put("endTime", now + HOUR_MS);
    row.put("lastModifiedTime", now);
    row.put("status", "confirmed");
    return row;
  }

  /**
   * Whether an insert's answer names a written row: the Supernote providers answer a refused row
   * with a null URI or the id -1 (#43, #63). {@code lastSegment} is the answer's last path segment.
   */
  public static boolean wroteRow(boolean answered, String lastSegment) {
    return answered && lastSegment != null && !lastSegment.equals("-1");
  }

  private static final List<Target> ALL =
      Collections.unmodifiableList(
          Arrays.asList(
              new Target("digest-root", "content://com.ratta.supernote.knowledge.provider", "", false),
              new Target(
                  "digest", "content://com.ratta.supernote.knowledge.provider/digest", "digest_content", true),
              new Target(
                  "control-task", "content://com.ratta.supernote.task.provider/tasks_table", "title", true),
              new Target(
                  "control-calendar",
                  "content://com.ratta.supernote.calendar.provider/data_info",
                  "title",
                  true,
                  true)));

  private ProbeTargets() {}

  public static List<Target> all() {
    return ALL;
  }
}
