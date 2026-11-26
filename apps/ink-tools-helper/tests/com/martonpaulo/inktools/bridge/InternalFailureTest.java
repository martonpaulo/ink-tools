package com.martonpaulo.inktools.bridge;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** The Java adapter's failure value: a sentence for the person, every detail for the agent (#294). */
public final class InternalFailureTest {
  private static final String FIRMWARE = "test/fingerprint:11/1";
  private static final String ITEM = "pluginhost.call-numbers";

  public static void main(String[] args) {
    logsEveryField();
    showsTheCopySentence();
    refusesAnUnknownItem();
    endsALoopingChain();
    System.out.println("InternalFailureTest ok");
  }

  private static Map<String, String> apps() {
    Map<String, String> apps = new LinkedHashMap<>();
    apps.put("host", "1.00.2610150");
    apps.put("settings", "1.00.1");
    return apps;
  }

  /** The header names the item, level, method, firmware and app versions; each cause follows, outermost first. */
  private static void logsEveryField() {
    IllegalStateException root = new IllegalStateException("call 5 is now setPluginEnable");
    RuntimeException outer = new RuntimeException("refused", root);
    String log = new InternalFailure(ITEM, "uninstall", Copy.HOST_CHANGED, FIRMWARE, apps(), outer).agentLog();
    String header = log.split("\n")[0];
    for (String field : new String[] {"registry=" + ITEM, "level=5", "owner=ink-tools-helper", "method=uninstall",
        "firmware=" + FIRMWARE, "apps=host@1.00.2610150,settings@1.00.1"}) {
      HostCallsTest.check(header.contains(field), "the header holds " + field);
    }
    HostCallsTest.check(log.contains("cause java.lang.RuntimeException: refused"), "the outer cause is logged");
    HostCallsTest.check(log.contains("cause java.lang.IllegalStateException: call 5 is now setPluginEnable"), "the root cause is logged");
    HostCallsTest.check(log.indexOf("refused") < log.indexOf("call 5 is now"), "the chain runs outermost first");
    HostCallsTest.check(log.contains("\tat com.martonpaulo.inktools.bridge.InternalFailureTest"), "each cause carries its stack");
    String unread = new InternalFailure(ITEM, "uninstall", Copy.HOST_CHANGED, InternalFailure.UNREAD,
        Collections.<String, String>emptyMap(), outer).agentLog();
    HostCallsTest.check(unread.split("\n")[0].endsWith("firmware=unread apps=unread"), "an unread version says so, never a blank");
  }

  private static void showsTheCopySentence() {
    InternalFailure failure = new InternalFailure(ITEM, "uninstall", Copy.HOST_CHANGED, FIRMWARE, apps(), null);
    HostCallsTest.check(failure.userSentence(Copy.FAILURES).equals(Copy.FAILURES.get(Copy.HOST_CHANGED)), "the person sees the copy sentence");
    HostCallsTest.check(!failure.userSentence(Copy.FAILURES).contains("Exception"), "never a class name");
    InternalFailure missing = new InternalFailure(ITEM, "uninstall", "missing", FIRMWARE, apps(), null);
    try {
      missing.userSentence(Copy.FAILURES);
      throw new AssertionError("a missing copy key must throw");
    } catch (IllegalStateException expected) {
      HostCallsTest.check(expected.getMessage().equals("no copy for missing"), "a missing key names itself");
    }
  }

  private static void refusesAnUnknownItem() {
    try {
      new InternalFailure("pluginhost.nothing", "uninstall", Copy.HOST_CHANGED, FIRMWARE, apps(), null);
      throw new AssertionError("an unknown registry id must throw");
    } catch (IllegalArgumentException expected) {
      HostCallsTest.check(expected.getMessage().equals("no registry item pluginhost.nothing"), "an unknown id names itself");
    }
  }

  private static void endsALoopingChain() {
    RuntimeException a = new RuntimeException("a");
    RuntimeException b = new RuntimeException("b", a);
    a.initCause(b);
    HostCallsTest.check(InternalFailure.causeChain(b).size() == 2, "a looping chain ends");
    HostCallsTest.check(InternalFailure.causeChain(null).isEmpty(), "no cause, no chain");
  }
}
