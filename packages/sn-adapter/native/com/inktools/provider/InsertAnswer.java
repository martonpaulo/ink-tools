package com.inktools.provider;

/**
 * What a content provider's insert answer says (#217), apart from Android so a JVM test runs it. The
 * one owner of «did the insert write a row» for the Probe and Account Sync. The Supernote providers
 * answer a refused row with a null URI, a URI with no id, or a negative id such as -1 (#43, #63),
 * instead of throwing. An answer whose last segment is not a number counts as written: a row that
 * might exist is never reported as absent, and the revert still deletes every marked row.
 */
public final class InsertAnswer {
  private InsertAnswer() {}

  /** Whether the answer names a written row; {@code lastSegment} is its last path segment. */
  public static boolean wroteRow(boolean answered, String lastSegment) {
    if (!answered || lastSegment == null) {
      return false;
    }
    Long id = number(lastSegment);
    return id == null || id >= 0;
  }

  /** The written row's id, or null when the answer holds no id of zero or more. */
  public static String rowId(boolean answered, String lastSegment) {
    Long id = answered && lastSegment != null ? number(lastSegment) : null;
    return id != null && id >= 0 ? String.valueOf(id) : null;
  }

  private static Long number(String text) {
    try {
      return Long.parseLong(text.trim());
    } catch (NumberFormatException notNumeric) {
      return null;
    }
  }
}
