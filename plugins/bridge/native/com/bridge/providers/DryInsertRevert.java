package com.bridge.providers;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The revert of the probe's test row (#43), apart from Android so a JVM test runs it. The Calendar
 * provider's delete by the marker column removed 0 rows on the tablet (beta 11), so the revert
 * deletes by row id: the id the insert returned, and the id of every row the provider lists with the
 * marker, which also removes the rows earlier probes left. A row is deleted only when it is the new
 * row or its marker column holds the marker, read back here, never on the provider's filter alone.
 */
final class DryInsertRevert {
  /** The test write's table, reached through the provider. */
  interface Table {
    /** {id, marker column value} of each row the provider answers to a filter on the marker. */
    List<String[]> marked() throws Exception;

    /** The number of rows removed by deleting the one row with this id. */
    int deleteById(String id) throws Exception;
  }

  /** What the revert did: rows removed, and marked rows still listed after it. */
  static final class Result {
    final int removed;
    final int remaining;

    Result(int removed, int remaining) {
      this.removed = removed;
      this.remaining = remaining;
    }
  }

  private DryInsertRevert() {}

  /** Deletes the new row ({@code createdId}, or null) and every marked row, by id, then counts. */
  static Result revert(Table table, String marker, String createdId) throws Exception {
    Set<String> ids = new LinkedHashSet<>();
    if (createdId != null) {
      ids.add(createdId);
    }
    ids.addAll(markedIds(table, marker));
    int removed = 0;
    for (String id : ids) {
      removed += table.deleteById(id);
    }
    return new Result(removed, markedIds(table, marker).size());
  }

  private static Set<String> markedIds(Table table, String marker) throws Exception {
    Set<String> ids = new LinkedHashSet<>();
    for (String[] row : table.marked()) {
      if (row.length > 1 && row[0] != null && marker.equals(row[1])) {
        ids.add(row[0]);
      }
    }
    return ids;
  }
}
