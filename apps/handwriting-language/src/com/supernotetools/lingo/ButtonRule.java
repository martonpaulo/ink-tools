package com.supernotetools.lingo;

import java.util.Arrays;
import java.util.List;

/**
 * When the floating button shows (#195): only where the owner writes by default, or always, or
 * never. Where he writes is the handwriting keyboard open or a handwriting screen in front, as
 * WritingWatcher reads them from window events. No Android import, so a JVM test covers it.
 */
final class ButtonRule {
  private ButtonRule() {}

  /** The setting's three choices; `key` is what Prefs stores and the ADB extra takes. */
  enum Mode {
    WRITING("writing"),
    ALWAYS("always"),
    HIDDEN("hidden");

    final String key;

    Mode(String key) {
      this.key = key;
    }
  }

  static final Mode DEFAULT = Mode.WRITING;

  /**
   * The handwriting screens, by activity class name (docs/supernote.md › Handwriting recognition
   * language): Note pages, Digest, To-Do, Email.
   * shortcut: matched by simple class name, since the measure recorded no package; a same-named
   * activity of another app also counts. Match the full name once a device round records it.
   */
  static final List<String> WRITING_SCREENS =
      Arrays.asList("NoteInsidePagesActivity", "KnowledgeActivity", "TaskActivity", "HomeActivity");

  /** The stored or typed choice; null or an unknown key is the default. */
  static Mode mode(String key) {
    for (Mode mode : Mode.values()) {
      if (mode.key.equals(key)) {
        return mode;
      }
    }
    return DEFAULT;
  }

  /** Whether `className` (full or simple) names one of the handwriting screens. */
  static boolean isWritingScreen(String className) {
    if (className == null) {
      return false;
    }
    return WRITING_SCREENS.contains(className.substring(className.lastIndexOf('.') + 1));
  }

  /**
   * Whether the button shows. `watching` is false while the accessibility service is off: then
   * nothing tells where the owner writes, so the button shows everywhere rather than never, and
   * the settings screen shows the command that turns the service on.
   */
  static boolean visible(Mode mode, boolean watching, boolean keyboardOpen, String foreground) {
    switch (mode) {
      case ALWAYS:
        return true;
      case HIDDEN:
        return false;
      default:
        return !watching || keyboardOpen || isWritingScreen(foreground);
    }
  }
}
