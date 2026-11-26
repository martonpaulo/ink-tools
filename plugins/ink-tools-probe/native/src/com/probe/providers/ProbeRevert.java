package com.probe.providers;

import com.inktools.provider.DryInsertRevert;
import java.util.List;

/**
 * The revert of the probe's dry insert (#213), apart from Android so a JVM test runs it. It deletes
 * the new row by the id the insert returned, and every older marked row by its id, through
 * sn-adapter's {@link DryInsertRevert}, the one owner of that rule: the tablet's Calendar provider
 * removed 0 rows of a delete selected by the marker title (#43).
 */
final class ProbeRevert {
  private ProbeRevert() {}

  /**
   * Adds the {@code delete-marked} line, and a {@code LEFTOVER} line when a marked row is still
   * listed, or may be, after a written row. {@code createdId} is the insert's row id, or null.
   */
  static void revert(
      DryInsertRevert.Table table, String label, String markerColumn, String createdId, boolean inserted, List<String> lines) {
    String leftover =
        label + " LEFTOVER: a marked row may remain; delete rows where " + markerColumn + " = '" + ProbeTargets.MARKER + "'";
    try {
      DryInsertRevert.Result result = DryInsertRevert.revert(table, ProbeTargets.MARKER, createdId);
      lines.add(
          ProbeFormat.ok(
              label,
              "delete-marked",
              result.removed + " rows removed by " + ProbeTargets.ROW_ID + ", " + result.remaining + " marked rows left"));
      if (result.remaining > 0 || (inserted && result.removed == 0)) {
        lines.add(leftover);
      }
    } catch (Throwable error) {
      lines.add(ProbeFormat.failed(label, "delete-marked", error));
      if (inserted) {
        lines.add(leftover);
      }
    }
  }
}
