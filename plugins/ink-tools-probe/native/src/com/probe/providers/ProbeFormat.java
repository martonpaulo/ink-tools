package com.probe.providers;

/**
 * One log line per outcome. A line names the target, the operation and the result, never a row's
 * value: the probe must not leak the person's data (plugins/ink-tools-probe/AGENTS.md).
 */
public final class ProbeFormat {
  private ProbeFormat() {}

  public static String ok(String label, String op, String detail) {
    return label + " " + op + " OK " + detail;
  }

  /** A SecurityException is the answer the probe exists to find, so it is spelled out. */
  public static String failed(String label, String op, Throwable error) {
    String kind = error instanceof SecurityException ? "DENIED SecurityException" : "FAILED " + error.getClass().getSimpleName();
    String message = error.getMessage();
    return label + " " + op + " " + kind + (message == null ? "" : ": " + oneLine(message));
  }

  /** A column list without a single value: names only. */
  public static String columns(String[] names) {
    return names.length + " columns [" + String.join(",", names) + "]";
  }

  static String oneLine(String text) {
    String flat = text.replace('\n', ' ').replace('\r', ' ');
    return flat.length() > 300 ? flat.substring(0, 300) + "..." : flat;
  }
}
