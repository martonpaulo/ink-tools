package com.probe.providers;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Plain JVM test, no framework: run by `npm run test:native`. */
public final class ProbeTargetsTest {
  public static void main(String[] args) {
    boolean digest = false;
    boolean tasks = false;
    boolean calendar = false;
    for (ProbeTargets.Target t : ProbeTargets.all()) {
      digest |= t.uri.equals("content://com.ratta.supernote.knowledge.provider/digest") && t.writable;
      tasks |= t.label.equals("control-task");
      calendar |= t.label.equals("control-calendar");
      if (t.writable && t.markerColumn.isEmpty()) {
        throw new AssertionError(t.label + " is writable but has no marker column");
      }
    }
    check(digest, "the digest table is probed with a dry insert");
    check(tasks && calendar, "both control providers are present");
    check(ProbeTargets.all().get(0).uri.equals("content://com.ratta.supernote.knowledge.provider"), "the provider root is queried first");
    calendarRowFillsTheDescriptorColumns();
    calendarRevertCancelsLikeAccountSync();
    taskRowFillsTheDescriptorColumns();
    rowKeyIsTheDescriptors();
    urisAreTheRegistrys();
    System.out.println("ProbeTargetsTest ok");
  }

  /** #208: the control-calendar row fills every requiredOnInsert column with Account Sync's values. */
  static void calendarRowFillsTheDescriptorColumns() {
    String rules = rules("calendar");
    Set<String> columns = requiredOnInsert(rules, "calendar");
    ProbeTargets.Target calendar = target("control-calendar");
    long now = 1700000000000L;
    Map<String, Object> row = calendar.row(now);
    for (String column : columns) {
      check(row.get(column) != null, "the control-calendar row fills " + column);
    }
    check(row.get("tag").equals(text(rules, "writeTag")), "the tag is the descriptor's writeTag");
    check(String.valueOf(row.get("state")).equals(number(rules, "writeState")), "the state is the descriptor's writeState");
    check(row.get("status").equals(text(rules, "writeStatus")), "the status is the descriptor's writeStatus");
    check(row.get("title").equals(ProbeTargets.MARKER), "the title carries the marker the revert deletes by");
    check(row.get("startTime").equals(now) && row.get("endTime").equals(now + 3600000L), "the test event lasts one hour, in epoch ms");
    check(row.get("lastModifiedTime").equals(now), "lastModifiedTime is the insert time, in epoch ms");
  }

  /** #217: the control-task row fills every todo.rules.requiredOnInsert column, as the calendar row does. */
  static void taskRowFillsTheDescriptorColumns() {
    Set<String> columns = requiredOnInsert(rules("todo"), "todo");
    check(columns.contains("taskId"), "the descriptor lists taskId among the task's NOT NULL columns");
    Map<String, Object> task = target("control-task").row(1700000000000L);
    for (String column : columns) {
      check(task.get(column) != null, "the control-task row fills " + column);
    }
    check(task.get("title").equals(ProbeTargets.MARKER), "the task title carries the marker the revert deletes by");
  }

  /** #217: every fields.rowId of the descriptor's Calendar and To-Do tables is the key the revert deletes by. */
  static void rowKeyIsTheDescriptors() {
    String json = descriptor();
    for (String[] part : new String[][] {{"\"calendar\"", "\"todo\""}, {"\"todo\"", "\"digest\""}}) {
      int from = json.indexOf(part[0]);
      int to = json.indexOf(part[1], from);
      check(from >= 0 && to > from, "the descriptor has " + part[0]);
      Matcher rowId = Pattern.compile("\"rowId\"\\s*:\\s*\"([^\"]*)\"").matcher(json.substring(from, to));
      int found = 0;
      while (rowId.find()) {
        found++;
        check(rowId.group(1).equals(ProbeTargets.ROW_ID), part[0] + " maps rowId to " + ProbeTargets.ROW_ID);
      }
      check(found > 0, part[0] + " maps a rowId field");
    }
  }

  /** #294: every target URI is the registry's, through the generated reader, and the descriptor's authority. */
  static void urisAreTheRegistrys() {
    String json = descriptor();
    check(target("control-calendar").uri.equals(Registry.CalendarProvider.EVENTS_URI), "the calendar URI is the registry's events table");
    check(target("control-task").uri.equals(Registry.TodoProvider.TASKS_URI), "the task URI is the registry's tasks table");
    check(target("digest").markerColumn.equals(Registry.DiagnosticsProviderProbes.DIGEST_MARKER_COLUMN), "the digest marker column is the registry's");
    for (String authority :
        new String[] {Registry.CalendarProvider.AUTHORITY, Registry.TodoProvider.AUTHORITY, Registry.DigestProvider.AUTHORITY}) {
      check(json.contains("\"authority\": \"" + authority + "\""), "the descriptor names the authority " + authority);
    }
    check(target("digest-root").uri.endsWith(Registry.DigestProvider.AUTHORITY), "the digest root is the registry's authority");
    check(ProbeCommandFile.FOLDER.equals(Registry.StorageHelperChannel.FOLDER), "the command folder is the registry's helper channel");
  }

  static Set<String> requiredOnInsert(String rules, String section) {
    Matcher required = Pattern.compile("\"requiredOnInsert\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(rules);
    check(required.find(), "the descriptor lists " + section + ".rules.requiredOnInsert");
    Set<String> columns = new LinkedHashSet<>();
    for (String name : required.group(1).split(",")) {
      columns.add(name.trim().replace("\"", ""));
    }
    return columns;
  }

  static ProbeTargets.Target target(String label) {
    for (ProbeTargets.Target t : ProbeTargets.all()) {
      if (t.label.equals(label)) {
        return t;
      }
    }
    throw new AssertionError("no target " + label);
  }

  /** #208: the Calendar's delete is a no-op, so only its revert cancels, by the descriptor's status and modified columns. */
  static void calendarRevertCancelsLikeAccountSync() {
    String descriptor = descriptor();
    String rules = rules("calendar");
    check(target("control-calendar").cancelsOnRevert(), "the control-calendar revert cancels the row");
    check(!target("control-task").cancelsOnRevert(), "the control-task revert still deletes by id");
    check(ProbeTargets.CANCELLED_STATUS.equals(text(rules, "cancelledStatus")), "the cancelled status is the descriptor's");
    check(descriptor.contains("\"status\": \"" + ProbeTargets.STATUS_COLUMN + "\""), "the status column is the descriptor's");
    check(descriptor.contains("\"modified\": \"" + ProbeTargets.MODIFIED_COLUMN + "\""), "the modified column is the descriptor's");
  }

  /** The descriptor's text: the JVM test has no JSON library. */
  static String descriptor() {
    String path = System.getProperty("probe.descriptor");
    check(path != null, "the test runs with -Dprobe.descriptor (npm run test:native)");
    try {
      return new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8);
    } catch (java.io.IOException error) {
      throw new AssertionError("cannot read the descriptor " + path + ": " + error.getMessage());
    }
  }

  /** The start of one section's rules object, up to its first closing brace, read as text. */
  static String rules(String section) {
    String json = descriptor();
    int at = json.indexOf("\"" + section + "\"");
    int rules = json.indexOf("\"rules\"", at);
    int end = json.indexOf("}", rules);
    check(at >= 0 && rules > at && end > rules, "the descriptor has " + section + ".rules");
    return json.substring(rules, end);
  }

  static String text(String rules, String key) {
    Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"").matcher(rules);
    check(m.find(), "calendar.rules has " + key);
    return m.group(1);
  }

  static String number(String rules, String key) {
    Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*(-?\\d+)").matcher(rules);
    check(m.find(), "calendar.rules has " + key);
    return m.group(1);
  }

  static void check(boolean ok, String what) {
    if (!ok) {
      throw new AssertionError(what);
    }
  }
}
