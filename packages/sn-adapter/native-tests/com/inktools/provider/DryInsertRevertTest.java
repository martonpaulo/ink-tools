package com.inktools.provider;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** JVM checks of the probe's revert (#43); run by the Account Sync gate, `npm run test:native` in plugins/bridge. */
public final class DryInsertRevertTest {
  private static final String MARKER = "Account Sync dry insert";

  /** A table whose filter on the marker answers every row, as a provider that ignores it would. */
  private static class FakeTable implements DryInsertRevert.Table {
    final Map<String, String> rows = new LinkedHashMap<>();
    final List<String> deletes = new ArrayList<>();

    @Override
    public List<String[]> marked() {
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

  private static void check(boolean ok, String what) {
    if (!ok) {
      throw new AssertionError(what);
    }
  }

  public static void main(String[] args) throws Exception {
    // Insert then delete by the id the insert returned; the owner's row is never deleted.
    FakeTable one = new FakeTable();
    one.rows.put("1", "Dentist");
    one.rows.put("203", MARKER);
    DryInsertRevert.Result r = DryInsertRevert.revert(one, MARKER, "203");
    check(r.removed == 1 && r.remaining == 0, "the new row is deleted by its id");
    check(one.deletes.equals(Arrays.asList("203")), "only the new row's id is deleted: " + one.deletes);
    check(one.rows.containsKey("1"), "the owner's row stays");

    // Rows earlier probes left are deleted by their ids too.
    FakeTable left = new FakeTable();
    left.rows.put("196", MARKER);
    left.rows.put("197", MARKER);
    left.rows.put("5", "Standup");
    left.rows.put("204", MARKER);
    r = DryInsertRevert.revert(left, MARKER, "204");
    check(r.removed == 3 && r.remaining == 0, "every marked row is removed");
    check(left.rows.size() == 1 && left.rows.containsKey("5"), "only marked rows are removed");

    // A delete that removes nothing is reported, never a pass.
    FakeTable stuck =
        new FakeTable() {
          @Override
          public int deleteById(String id) {
            deletes.add(id);
            return 0;
          }
        };
    stuck.rows.put("9", MARKER);
    r = DryInsertRevert.revert(stuck, MARKER, "9");
    check(r.removed == 0 && r.remaining == 1, "a row the delete left is counted");

    // No id from the insert: the marked rows are still found and deleted.
    FakeTable noId = new FakeTable();
    noId.rows.put("12", MARKER);
    r = DryInsertRevert.revert(noId, MARKER, null);
    check(r.removed == 1 && r.remaining == 0, "a marked row is found without the insert's id");
    System.out.println("DryInsertRevertTest: 4 cases passed");
  }
}
