package com.probe.providers;

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
    System.out.println("ProbeTargetsTest ok");
  }

  static void check(boolean ok, String what) {
    if (!ok) {
      throw new AssertionError(what);
    }
  }
}
