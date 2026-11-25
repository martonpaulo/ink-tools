package com.supernotetools.lingo;

import java.io.IOException;

/**
 * A language-file failure with its kind. The message keeps the detail for the log; the screen
 * shows `Copy.failure(kind)` only, so no raw exception text reaches the owner (#280).
 */
final class FileFailure extends IOException {
  enum Kind {
    CANNOT_READ,
    CANNOT_CREATE,
    CANNOT_DELETE,
    NOT_A_CODE,
    NOT_INSTALLED,
    NOTHING_TO_CYCLE,
    FILES_OFF,
    OTHER
  }

  final Kind kind;

  FileFailure(Kind kind, String detail) {
    super(detail);
    this.kind = kind;
  }

  /** The sentence for the screen; a plain IOException is `OTHER`. */
  static String sentence(IOException error) {
    return Copy.failure(error instanceof FileFailure ? ((FileFailure) error).kind : Kind.OTHER);
  }
}
