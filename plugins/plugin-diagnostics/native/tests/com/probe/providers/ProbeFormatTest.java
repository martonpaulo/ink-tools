package com.probe.providers;

/** Plain JVM test, no framework: run by `npm run test:native`. */
public final class ProbeFormatTest {
  public static void main(String[] args) {
    eq(ProbeFormat.failed("digest", "query", new SecurityException("Permission Denial: READ_KNOWLEDGE")),
        "digest query DENIED SecurityException: Permission Denial: READ_KNOWLEDGE");
    eq(ProbeFormat.failed("x", "insert", new IllegalArgumentException("a\nb")), "x insert FAILED IllegalArgumentException: a b");
    eq(ProbeFormat.failed("x", "insert", new RuntimeException()), "x insert FAILED RuntimeException");
    eq(ProbeFormat.ok("x", "query", "2 rows"), "x query OK 2 rows");
    eq(ProbeFormat.columns(new String[] {"id", "title"}), "2 columns [id,title]");
    String longText = new String(new char[500]).replace('\0', 'a');
    if (ProbeFormat.oneLine(longText).length() != 303) {
      throw new AssertionError("a long message is cut at 300 characters");
    }
    System.out.println("ProbeFormatTest ok");
  }

  static void eq(String actual, String expected) {
    if (!actual.equals(expected)) {
      throw new AssertionError("expected <" + expected + "> but was <" + actual + ">");
    }
  }
}
