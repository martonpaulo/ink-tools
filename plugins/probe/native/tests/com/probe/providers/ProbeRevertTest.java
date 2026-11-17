package com.probe.providers;

import com.inktools.provider.DryInsertRevert;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Plain JVM test of the dry insert's revert by row id (#213): run by `npm run test:native`. */
public final class ProbeRevertTest {
  /**
   * A table with no delete by the marker at all, only by id, as the tablet's Calendar provider
   * behaves: its filter on the marker answers every row, and the revert must read the marker back.
   */
  private static class FakeTable implements DryInsertRevert.Table {
    final Map<String, String> rows = new LinkedHashMap<>();
    final List<String> deletes = new ArrayList<>();

    @Override
    public List<String[]> marked() throws Exception {
      List<String[]> out = new ArrayList<>();
      for (Map.Entry<String, String> row : rows.entrySet()) {
        out.add(new String[] {row.getKey(), row.getValue()});
      }
      return out;
    }

    @Override
    public int deleteById(String id) {
      deletes.add(id);
      return rows.remove(id) == null ? 0 : 1;
    }
  }

  public static void main(String[] args) {
    insertThenDeleteById();
    aRowTheDeleteLeftIsReported();
    aFailedRevertIsReported();
    noRowNoLeftover();
    System.out.println("ProbeRevertTest ok");
  }

  static void insertThenDeleteById() {
    FakeTable table = new FakeTable();
    table.rows.put("1", "Dentist");
    table.rows.put("196", ProbeTargets.MARKER);
    table.rows.put("203", ProbeTargets.MARKER);
    List<String> lines = new ArrayList<>();
    ProbeRevert.revert(table, "control-calendar", "title", "203", true, lines);
    check(table.deletes.equals(Arrays.asList("203", "196")), "the new row, then the older marked row, by id: " + table.deletes);
    check(table.rows.keySet().equals(new java.util.LinkedHashSet<>(Arrays.asList("1"))), "the owner's row stays");
    check(lines.size() == 1, "one line when nothing is left: " + lines);
    check(lines.get(0).equals(ProbeFormat.ok("control-calendar", "delete-marked", "2 rows removed by id, 0 marked rows left")), lines.get(0));
  }

  static void aRowTheDeleteLeftIsReported() {
    FakeTable table =
        new FakeTable() {
          @Override
          public int deleteById(String id) {
            deletes.add(id);
            return 0;
          }
        };
    table.rows.put("9", ProbeTargets.MARKER);
    List<String> lines = new ArrayList<>();
    ProbeRevert.revert(table, "control-calendar", "title", "9", true, lines);
    check(lines.size() == 2 && lines.get(1).startsWith("control-calendar LEFTOVER:"), "a row the delete left is a LEFTOVER: " + lines);
  }

  static void aFailedRevertIsReported() {
    FakeTable table =
        new FakeTable() {
          @Override
          public List<String[]> marked() throws Exception {
            throw new IllegalStateException("the provider listed no id or title column");
          }
        };
    List<String> lines = new ArrayList<>();
    ProbeRevert.revert(table, "digest", "digest_content", "4", true, lines);
    check(lines.size() == 2 && lines.get(0).contains("delete-marked") && lines.get(0).contains("FAILED"), "a failed revert is FAILED: " + lines);
    check(lines.get(1).startsWith("digest LEFTOVER:"), "and the written row may remain: " + lines);
  }

  static void noRowNoLeftover() {
    FakeTable table = new FakeTable();
    List<String> lines = new ArrayList<>();
    ProbeRevert.revert(table, "control-task", "title", null, false, lines);
    check(lines.size() == 1 && table.deletes.isEmpty(), "a refused insert deletes nothing: " + lines);
  }

  static void check(boolean ok, String what) {
    if (!ok) {
      throw new AssertionError(what);
    }
  }
}
