package com.inktools.provider;

/** JVM checks of the written-row rule (#217); run by the Account Sync gate, `npm run test:native` in plugins/account-sync. */
public final class InsertAnswerTest {
  private static void check(boolean ok, String what) {
    if (!ok) {
      throw new AssertionError(what);
    }
  }

  public static void main(String[] args) {
    check(!InsertAnswer.wroteRow(false, null), "a null answer wrote no row");
    check(!InsertAnswer.wroteRow(true, null), "an answer without an id wrote no row");
    check(!InsertAnswer.wroteRow(true, "-1"), "the id -1 wrote no row");
    check(!InsertAnswer.wroteRow(true, "-7"), "any id below 0 wrote no row");
    check(InsertAnswer.wroteRow(true, "0"), "the id 0 is a written row");
    check(InsertAnswer.wroteRow(true, "42"), "a positive id is a written row");
    check(InsertAnswer.wroteRow(true, "data_info"), "an answer with no numeric id may have written a row");
    check("42".equals(InsertAnswer.rowId(true, "42")), "the row id of a written row");
    check(InsertAnswer.rowId(true, "-1") == null, "a refused row has no id");
    check(InsertAnswer.rowId(true, "data_info") == null, "a non-numeric answer has no id");
    check(InsertAnswer.rowId(false, "42") == null, "no answer has no id");
    System.out.println("InsertAnswerTest ok");
  }
}
