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
   * The handwriting screens, by activity class name (registry item handwriting.writing-screens):
   * Note pages, Digest, To-Do, Email.
   * shortcut: matched by simple class name, since the measure recorded no package; a same-named
   * activity of another app also counts. Match the full name once a device round records it.
   */
  static final List<String> WRITING_SCREENS = Registry.HandwritingWritingScreens.ACTIVITIES;

  /**
   * The system events after which the button's service starts again: a restart of the tablet, and
   * an update of the app, which stops the service (#244). Intent action names, so no Android import.
   */
  static final List<String> RESTART_ACTIONS =
      Arrays.asList("android.intent.action.BOOT_COMPLETED", "android.intent.action.MY_PACKAGE_REPLACED");

  /** Whether `action` starts the service again: one of RESTART_ACTIONS, unless the button is hidden. */
  static boolean restartsOn(String action, Mode mode) {
    return mode != Mode.HIDDEN && RESTART_ACTIONS.contains(action);
  }

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
   * the settings screen shows the command that turns the service on. While the app's own screen is
   * in front the button never shows, so it never covers that screen's controls (owner, #275).
   */
  static boolean visible(Mode mode, boolean ownScreen, boolean watching, boolean keyboardOpen, String foreground) {
    if (ownScreen) {
      return false;
    }
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
