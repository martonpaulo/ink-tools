package com.supernotetools.lingo;

import java.io.IOException;
import java.util.Map;

/**
 * A language-file failure with its kind. The message keeps the detail for the log; the screen
 * shows `Copy.failure(kind)` only, so no raw exception text reaches the owner (#280).
 */
final class FileFailure extends IOException {
  enum Kind {
    CANNOT_READ,
    CANNOT_CREATE,
    CANNOT_DELETE,
    NOT_INSTALLED,
    NOTHING_TO_CYCLE,
    FILES_OFF,
    /** The registry's kill switch turned the language folder's module off (#293). */
    TURNED_OFF,
    OTHER
  }

  final Kind kind;

  FileFailure(Kind kind, String detail) {
    super(detail);
    this.kind = kind;
  }

  /** The registry item a failed read or write of the language folder concerns (#294). */
  static final String LANGUAGE_FILE_ITEM = "handwriting.language-file";

  /**
   * The Java adapter's failure value when the device's language folder failed a read or a write
   * (#294), so the log carries the item, the firmware and the app versions; null for a failure
   * that is not the device's or the kill switch's, such as a pack that is not installed or access that is off.
   */
  InternalFailure internal(String method, String firmware, Map<String, String> apps) {
    switch (kind) {
      case CANNOT_READ:
      case CANNOT_CREATE:
      case CANNOT_DELETE:
      case TURNED_OFF:
        return new InternalFailure(LANGUAGE_FILE_ITEM, method, kind.name(), firmware, apps, this);
      default:
        return null;
    }
  }

  /** The sentence for the screen; a plain IOException is `OTHER`. */
  static String sentence(IOException error) {
    return Copy.failure(error instanceof FileFailure ? ((FileFailure) error).kind : Kind.OTHER);
  }
}
