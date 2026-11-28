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
   * The package whose overlay window is a plugin view (registry item handwriting.writing-screens):
   * PluginHost shows every plugin view, a plugin's Settings included, in its own window over the
   * screen behind it, never in an Activity, so the foreground activity still names that screen.
   */
  static final String PLUGIN_VIEW_PACKAGE = Registry.HandwritingWritingScreens.PLUGIN_VIEW_PACKAGE;

  /** Whether a window of `packageName` is a plugin view. */
  static boolean isPluginView(CharSequence packageName) {
    return packageName != null && PLUGIN_VIEW_PACKAGE.contentEquals(packageName);
  }

  /**
   * Whether a window is a plugin view, by its root node's package or by its title. Over Account
   * Sync's Settings the root package alone never told (device round 7, #415: the button stayed and
   * no line was logged), so a title naming the package counts too [unverified]; the watcher's log
   * line names each window's package and title for the next device round.
   */
  static boolean isPluginWindow(CharSequence rootPackage, CharSequence title) {
    return isPluginView(rootPackage) || isPluginView(title);
  }

  /** One window of a watcher log line: its type, root package and title, `-` for a missing one. */
  static String windowEntry(int type, CharSequence rootPackage, CharSequence title) {
    return type + ":" + (rootPackage == null ? "-" : rootPackage) + ":" + (title == null ? "-" : title);
  }

  /**
   * Whether the button shows. `watching` is false while the accessibility service is off: then
   * nothing tells where the owner writes, so the button shows everywhere rather than never, and
   * the settings screen shows the command that turns the service on. While the app's own screen is
   * in front the button never shows, so it never covers that screen's controls (owner, #275).
   * While a plugin view is open, the writing screen behind it takes no handwriting, so only the
   * keyboard shows the button there (#415), in «Always» too: a press on a plugin's control under
   * the button changed the language instead (#557).
   */
  static boolean visible(
      Mode mode, boolean ownScreen, boolean watching, boolean keyboardOpen, boolean pluginView, String foreground) {
    if (ownScreen || mode == Mode.HIDDEN) {
      return false;
    }
    if (pluginView && !keyboardOpen) {
      return false;
    }
    return mode == Mode.ALWAYS || !watching || keyboardOpen || isWritingScreen(foreground);
  }
}
