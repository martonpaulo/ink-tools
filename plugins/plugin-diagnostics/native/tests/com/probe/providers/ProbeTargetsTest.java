package com.probe.providers;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
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
    refusedInsertsWriteNoRow();
    System.out.println("ProbeTargetsTest ok");
  }

  /** #208: the control-calendar row fills every requiredOnInsert column with Account Sync's values. */
  static void calendarRowFillsTheDescriptorColumns() {
    String rules = calendarRules(System.getProperty("probe.descriptor"));
    Matcher required = Pattern.compile("\"requiredOnInsert\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(rules);
    check(required.find(), "the descriptor lists calendar.rules.requiredOnInsert");
    Set<String> columns = new LinkedHashSet<>();
    for (String name : required.group(1).split(",")) {
      columns.add(name.trim().replace("\"", ""));
    }
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
    Map<String, Object> task = target("control-task").row(now);
    check(task.keySet().equals(new LinkedHashSet<>(Arrays.asList("title"))), "the control-task row holds only the marker");
  }

  static ProbeTargets.Target target(String label) {
    for (ProbeTargets.Target t : ProbeTargets.all()) {
      if (t.label.equals(label)) {
        return t;
      }
    }
    throw new AssertionError("no target " + label);
  }

  /** The providers answer a refused row with null or the id -1 (#43); the probe says no row was written. */
  static void refusedInsertsWriteNoRow() {
    check(!ProbeTargets.wroteRow(false, null), "a null answer wrote no row");
    check(!ProbeTargets.wroteRow(true, "-1"), "the id -1 wrote no row");
    check(!ProbeTargets.wroteRow(true, null), "an answer without an id wrote no row");
    check(ProbeTargets.wroteRow(true, "42"), "a positive id is a written row");
  }

  /** The descriptor's calendar.rules object, read as text: the JVM test has no JSON library. */
  static String calendarRules(String path) {
    check(path != null, "the test runs with -Dprobe.descriptor (npm run test:native)");
    String json;
    try {
      json = new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8);
    } catch (java.io.IOException error) {
      throw new AssertionError("cannot read the descriptor " + path + ": " + error.getMessage());
    }
    int calendar = json.indexOf("\"calendar\"");
    int rules = json.indexOf("\"rules\"", calendar);
    int end = json.indexOf("}", rules);
    check(calendar >= 0 && rules > calendar && end > rules, "the descriptor has calendar.rules");
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
