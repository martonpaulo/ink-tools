package com.martonpaulo.inktools.bridge;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The firmware watch's fingerprint, statuses and answer line, over fake probes (#293). */
public final class WatchTest {
  private static final String FIRMWARE = "test/fingerprint:11/1";

  public static void main(String[] args) {
    fingerprintChangesWithEveryInput();
    probesReadOkChangedOrBroken();
    everyRegistryItemHasOneResult();
    noticeNamesEachBrokenFeatureOnce();
    callNumbersReportEveryRefusal();
    System.out.println("WatchTest ok");
  }

  private static Map<String, Long> versions(long host) {
    Map<String, Long> versions = new LinkedHashMap<>();
    versions.put("vendor.settings", 7L);
    versions.put("vendor.host", host);
    return versions;
  }

  /** The same environment twice is not due; a firmware, an app version, an app or the registry changes it. */
  private static void fingerprintChangesWithEveryInput() {
    String first = Watch.fingerprint(FIRMWARE, versions(1), "2026.11.25");
    HostCallsTest.check(first.matches("[0-9a-f]{64}"), "the fingerprint is a SHA-256 in hex");
    Map<String, Long> reordered = new LinkedHashMap<>();
    reordered.put("vendor.host", 1L);
    reordered.put("vendor.settings", 7L);
    HostCallsTest.check(first.equals(Watch.fingerprint(FIRMWARE, reordered, "2026.11.25")), "the apps' order does not matter");
    HostCallsTest.check(!Watch.due(first, first), "an unchanged fingerprint runs nothing");
    HostCallsTest.check(Watch.due(first, null), "the first run is due");
    Map<String, Long> added = versions(1);
    added.put("vendor.new", 1L);
    for (String changed : new String[] {
        Watch.fingerprint("test/fingerprint:11/2", versions(1), "2026.11.25"),
        Watch.fingerprint(FIRMWARE, versions(2), "2026.11.25"),
        Watch.fingerprint(FIRMWARE, added, "2026.11.25"),
        Watch.fingerprint(FIRMWARE, versions(1), "2026.11.26")}) {
      HostCallsTest.check(Watch.due(changed, first), "a changed input runs the watch");
    }
  }

  private static Registry.Item item(String id, String probe, String unprobed, String off) {
    return new Registry.Item(id, 2, "user", "sn-adapter", probe, unprobed, "active", off);
  }

  /** ok, changed and throwing probes; an unprobed, an off and an elsewhere-probed item keep their reasons. */
  private static void probesReadOkChangedOrBroken() {
    List<Registry.Item> items = Arrays.asList(
        item("todo.provider", "watch", null, null),
        item("calendar.provider", "watch", null, null),
        item("digest.provider", "watch", null, null),
        item("todo.row-rules", null, "shows only in the app", null),
        item("pen.pen-types", "watch", null, "until 2999-01-01: the pen ids changed"),
        item("system.firmware-page", "inkctl firmware", null, null));
    Map<String, Watch.Probe> probes = new HashMap<>();
    probes.put("todo.provider", () -> null);
    probes.put("calendar.provider", () -> "no provider answers a.provider");
    probes.put("digest.provider", () -> {
      throw new IllegalStateException("host | gone");
    });
    probes.put("pen.pen-types", () -> {
      throw new AssertionError("an item whose switch is off is never probed");
    });
    List<Watch.Result> results = Watch.run(items, probes);
    HostCallsTest.check(results.get(0).status == Watch.Status.OK && results.get(0).detail == null, "a holding item is ok");
    HostCallsTest.check(results.get(1).status == Watch.Status.BROKEN
        && results.get(1).detail.equals("no provider answers a.provider"), "a changed item is broken with what changed");
    HostCallsTest.check(results.get(2).status == Watch.Status.BROKEN
        && results.get(2).detail.contains("IllegalStateException"), "a probe that throws is broken, and the run goes on");
    HostCallsTest.check(results.get(3).status == Watch.Status.UNPROBED
        && results.get(3).detail.equals("shows only in the app"), "an unprobed item keeps its reason");
    HostCallsTest.check(results.get(4).status == Watch.Status.UNPROBED
        && results.get(4).detail.equals("turned off until 2999-01-01: the pen ids changed"), "an item turned off says until when");
    HostCallsTest.check(results.get(5).detail.equals("probed by inkctl firmware"), "an item probed elsewhere names its probe");
    HostCallsTest.check(Watch.broken(results).size() == 2, "two items are broken");
    String line = Watch.line("abc", results);
    HostCallsTest.check(line.equals("watch abc | todo.provider ok | calendar.provider broken no provider answers a.provider"
        + " | digest.provider broken java.lang.IllegalStateException: host / gone"
        + " | todo.row-rules unprobed | pen.pen-types unprobed"), "the answer line: " + line);
    HostCallsTest.check(!line.contains("\n"), "the answer is one line");
  }

  /** The Helper's reader lists every registry item, so one run gives each its status. */
  private static void everyRegistryItemHasOneResult() {
    List<Watch.Result> results = Watch.run(Registry.ITEMS, Collections.<String, Watch.Probe>emptyMap());
    HostCallsTest.check(results.size() == Registry.ITEMS.size(), "one result per item");
    HostCallsTest.check(Registry.ITEMS.size() > 40, "the reader holds the whole registry: " + Registry.ITEMS.size());
    for (Watch.Result result : results) {
      HostCallsTest.check(result.status == Watch.Status.UNPROBED && result.detail != null, result.item.id + " never reads ok without a probe");
    }
  }

  private static void noticeNamesEachBrokenFeatureOnce() {
    Watch.Result calendar = new Watch.Result(item("calendar.provider", "watch", null, null), Watch.Status.BROKEN, "gone");
    Watch.Result todo = new Watch.Result(item("todo.provider", "watch", null, null), Watch.Status.BROKEN, "gone");
    String notice = Copy.watchNotice(Arrays.asList(calendar, todo));
    HostCallsTest.check(notice.indexOf(Copy.FEATURES.get("sn-adapter")) == notice.lastIndexOf(Copy.FEATURES.get("sn-adapter")),
        "a feature with two broken items is named once");
    HostCallsTest.check(notice.endsWith("inkctl firmware check"), "the notice ends with the next step");
    HostCallsTest.check(!notice.contains("provider") && !notice.contains("Exception"), "the notice names no internal");
    for (Registry.Item entry : Registry.ITEMS) {
      if (entry.probe != null && entry.probe.startsWith("ink-tools-helper")) {
        HostCallsTest.check(Copy.FEATURES.containsKey(entry.owner), entry.owner + " has a feature sentence");
      }
    }
  }

  private static void callNumbersReportEveryRefusal() {
    Map<String, Integer> stub = new HashMap<>();
    stub.put("installPlugin", 1);
    stub.put("uninstallPlugin", 5);
    stub.put("setPluginEnable", 6);
    stub.put("updatePluginPermissions", 9);
    HostCallsTest.check(HostCalls.callNumbersChanged(stub) == null, "today's Stub passes");
    stub.put("uninstallPlugin", 4);
    stub.remove("updatePluginPermissions");
    String changed = HostCalls.callNumbersChanged(stub);
    HostCallsTest.check(changed != null && changed.contains("uninstallPlugin 4, not 5") && changed.contains("updatePluginPermissions"),
        "each changed number is named: " + changed);
  }
}
