package com.probe.providers;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * The providers the probe tries (#59): the Digest (Knowledge) provider under test and two
 * known-open providers as controls. The URIs and marker columns come from the sn-adapter
 * descriptor (packages/sn-adapter/src/descriptor.json); keep the two in step.
 */
public final class ProbeTargets {
  /** Written into a dry insert and the only row the revert may delete. */
  public static final String MARKER = "SNPROBE dry insert";

  /** One provider URI to query, and how to insert and revert one marked row. */
  public static final class Target {
    public final String label;
    public final String uri;
    /** Text column that holds {@link #MARKER}; the revert deletes only rows where it equals it. */
    public final String markerColumn;
    /** Whether a dry insert is tried: false for the provider root, which has no table. */
    public final boolean writable;

    Target(String label, String uri, String markerColumn, boolean writable) {
      this.label = label;
      this.uri = uri;
      this.markerColumn = markerColumn;
      this.writable = writable;
    }
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
                  true)));

  private ProbeTargets() {}

  public static List<Target> all() {
    return ALL;
  }
}
