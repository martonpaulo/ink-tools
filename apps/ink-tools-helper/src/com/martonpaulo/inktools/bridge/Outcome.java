package com.martonpaulo.inktools.bridge;

/**
 * What the receiver hands back to {@code am broadcast} as its result code and data (#215). A code
 * of 0 is never used: it is what {@code am} prints when no receiver ran, so inkctl can tell an
 * absent bridge from a refusal. cli/inkctl reads these same numbers (BRIDGE_RESULTS).
 */
public final class Outcome {
  public static final int OK = 1;
  public static final int FAILED = 2;
  public static final int USAGE = 3;
  public static final int UNREACHABLE = 4;
  public static final int TIMEOUT = 5;

  public final int code;
  public final String data;

  private Outcome(int code, String data) {
    this.code = code;
    this.data = data;
  }

  public static Outcome of(int code, String detail) {
    String word;
    switch (code) {
      case OK: word = "ok"; break;
      case USAGE: word = "usage"; break;
      case UNREACHABLE: word = "unreachable"; break;
      case TIMEOUT: word = "timeout"; break;
      default: word = "failed"; break;
    }
    // One line: am prints data between quotes, and a newline would split inkctl's parse.
    String flat = detail == null ? "" : detail.replace('\n', ' ').replace('"', '\'');
    return new Outcome(code, flat.isEmpty() ? word : word + " " + flat);
  }
}
