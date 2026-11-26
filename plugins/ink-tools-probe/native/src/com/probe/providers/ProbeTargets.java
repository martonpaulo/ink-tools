package com.probe.providers;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The providers the probe tries (#59): the Digest (Knowledge) provider under test and two
 * known-open providers as controls. The URIs come from the registry of internals through {@link
 * Registry}, which scripts/registry.py writes (#294): the provider items' authorities and tables,
 * and the Digest paths and marker column of diagnostics.provider-probes. The columns still mirror
 * the sn-adapter descriptor, which ProbeTargetsTest keeps them equal to.
 */
public final class ProbeTargets {
  /** Written into a dry insert and the only row the revert may delete. */
  public static final String MARKER = "SNPROBE dry insert";

  /**
   * The row key the revert deletes by (#213): the descriptor's {@code fields.rowId} of {@code
   * data_info} and {@code tasks_table}, which ProbeTargetsTest keeps equal to this (#217). The Digest
   * table's key is not known; a revert there that finds no {@code id} column fails with a FAILED
   * line, never a silent pass.
   */
  public static final String ROW_ID = "id";

  /**
   * A row id no provider gives: the Supernote providers answer a refused insert with -1 (#63). The
   * Calendar's write test selects it, as sn-adapter's {@code NO_ROW_ID} does (#213).
   */
  static final String NO_ROW_ID = "-1";

  /**
   * The Calendar's revert cancels the row, as Account Sync's writer does, because its delete is a
   * no-op on the tablet (#208, #43). They mirror the descriptor's {@code calendar.rules.cancelledStatus}
   * and the {@code status} and {@code modified} fields; ProbeTargetsTest keeps them equal.
   */
  static final String STATUS_COLUMN = "status";

  static final String CANCELLED_STATUS = "cancelled";
  static final String MODIFIED_COLUMN = "lastModifiedTime";

  /** One provider URI to query, and how to insert and revert one marked row. */
  public static final class Target {
    public final String label;
    public final String uri;
    /** Text column that holds {@link #MARKER}; the revert deletes, by row id, only rows where it equals it. */
    public final String markerColumn;
    /** Whether a write test is tried: false for the provider root, which has no table. */
    public final boolean writable;
    /** The NOT NULL columns the dry insert fills ({@link #taskRow} or none), or the Calendar's write test. */
    final Kind kind;

    Target(String label, String uri, String markerColumn, boolean writable) {
      this(label, uri, markerColumn, writable, Kind.PLAIN);
    }

    Target(String label, String uri, String markerColumn, boolean writable, Kind kind) {
      this.label = label;
      this.uri = uri;
      this.markerColumn = markerColumn;
      this.writable = writable;
      this.kind = kind;
    }

    /** Whether the revert cancels the row (the Calendar) instead of deleting it by id. */
    public boolean cancelsOnRevert() {
      return kind == Kind.CALENDAR;
    }

    /**
     * Whether the probe's write test inserts a marked row. Not for the Calendar (#213): its provider
     * cannot delete a row again, so every insert left one; its test is {@link #testWrite} instead.
     */
    public boolean insertsOnProbe() {
      return kind != Kind.CALENDAR;
    }

    /**
     * The Calendar's write test (#213): the columns an update selected by {@link #ROW_ID} {@code =}
     * {@link #NO_ROW_ID} sets, which matches no row, so the provider runs its write path and its
     * permission check and changes nothing. The column is one a real write sets, the status Account
     * Sync's writer cancels with, as sn-adapter's probeCapability does.
     */
    public Map<String, Object> testWrite() {
      Map<String, Object> values = new LinkedHashMap<>();
      values.put(STATUS_COLUMN, CANCELLED_STATUS);
      return values;
    }

    /** Every column of the dry insert, the marker included; only a target that {@link #insertsOnProbe}. */
    public Map<String, Object> row() {
      if (!insertsOnProbe()) {
        throw new IllegalStateException(label + " inserts no row");
      }
      Map<String, Object> row = kind == Kind.TASK ? taskRow() : new LinkedHashMap<String, Object>();
      row.put(markerColumn, MARKER);
      return row;
    }
  }

  /** Which provider's NOT NULL columns a dry insert fills. */
  enum Kind {
    PLAIN,
    CALENDAR,
    TASK
  }

  /**
   * The control-task test row (#217): every column of the descriptor's {@code
   * todo.rules.requiredOnInsert}, {@code title} and {@code taskId}, both the marker. ProbeTargetsTest
   * keeps the names equal to the descriptor.
   */
  static Map<String, Object> taskRow() {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("title", MARKER);
    row.put("taskId", MARKER);
    return row;
  }

  /**
   * A Digest provider URI: its root for an empty path, else the path under the root. The root is the
   * registry's knowledge table URI without its one-part table path, so the URI scheme keeps one owner.
   */
  static String digestUri(String path) {
    String table = Registry.DigestProvider.KNOWLEDGE_URI;
    String root = table.substring(0, table.lastIndexOf('/'));
    return path.isEmpty() ? root : root + "/" + path;
  }

  private static final List<Target> ALL =
      Collections.unmodifiableList(
          Arrays.asList(
              new Target(
                  "digest-root", digestUri(Registry.DiagnosticsProviderProbes.DIGEST_ROOT_PATH), "", false),
              new Target(
                  "digest",
                  digestUri(Registry.DiagnosticsProviderProbes.DIGEST_PATH),
                  Registry.DiagnosticsProviderProbes.DIGEST_MARKER_COLUMN,
                  true),
              new Target("control-task", Registry.TodoProvider.TASKS_URI, "title", true, Kind.TASK),
              new Target(
                  "control-calendar", Registry.CalendarProvider.EVENTS_URI, "title", true, Kind.CALENDAR)));

  private ProbeTargets() {}

  public static List<Target> all() {
    return ALL;
  }
}
