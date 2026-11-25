package com.supernotetools.lingo;

/**
 * Every visible text of the app, in English (root AGENTS.md › Product copy). The launcher
 * label lives in the manifest, which scripts/build.cjs writes, since a manifest cannot read Java.
 * The app shows its feature name, Handwriting Language; Lingo stays its internal name (#176).
 */
final class Copy {
  private Copy() {}

  static final String PACKAGE = "com.supernotetools.lingo";
  static final String TITLE = "Handwriting Language";
  static final String INTRO = "Switches the handwriting recognition language of the whole tablet.";
  static final String ACTIVE = "Active Language";
  static final String SWITCH_LANGUAGE = "Switch Language";
  static final String CLOSE = "Close";
  static final String NOT_READ = "Not read: All-files access is off.";
  static final String UNKNOWN = "Unknown: the language folder holds more than one language.";
  static final String BUTTON_SECTION = "Floating Button";
  static final String BUTTON_WRITING = "Only where you write: the handwriting keyboard, a note, Digest, To-Do, Email";
  static final String BUTTON_ALWAYS = "Always visible, over every app";
  static final String BUTTON_HIDDEN = "Hidden";
  static final String BUTTON_HELP = "One tap moves to the next language. A long press opens this screen. Drag the button to move it; it stays where you leave it. The Handwriting Language entry in the sidebar opens this screen.";
  static final String RESET_PLACE = "Reset Button Position";
  static final String RESET_OFF = "The button is hidden, so it has no position to reset.";
  static final String WATCHER_OFF = "Writing detection is off, so the floating button shows over every app.";
  static final String WATCHER_COMMANDS =
      "adb shell settings put secure enabled_accessibility_services " + PACKAGE + "/.WritingWatcher\n"
          + "adb shell settings put secure accessibility_enabled 1";
  static final String CYCLE_SECTION = "Languages in the Cycle";
  static final String CYCLE_HELP = "Only installed languages are listed. Install more in Settings, Handwriting language.";
  static final String CYCLE_NO_FILES = "Turn on All-files access above to list the languages.";
  static final String CYCLE_LAST = "Keep at least one language in the cycle.";
  static final String FILES_OFF = "All-files access is off, so the language cannot be switched.";
  static final String OVERLAY_OFF = "Display over other apps is off, so the floating button cannot show.";
  static final String GRANT_FROM_COMPUTER = "Or run this on a computer with ADB:";
  static final String WATCHER_FROM_COMPUTER = "Turn it on from a computer with ADB:";
  static final String OPEN_FILES_PERMISSION = "Open All-Files Access Settings";
  static final String OPEN_OVERLAY_PERMISSION = "Open Display Over Apps Settings";
  static final String NO_PERMISSION_SCREEN = "This tablet has no screen for this permission. Use the command above.";
  static final String SWITCH_FAILED = "The last switch failed:";
  static final String VERSION = "Version";
  static final String NOTIFICATION = "Handwriting Language floating button";
  static final String BUTTON_FAILED = "!";
  static final String BUTTON_DESCRIPTION = "Handwriting language %s. Tap to switch to the next language.";
  static final String BUTTON_FAILED_DESCRIPTION = "The language could not be switched. Open Handwriting Language from the sidebar.";

  static String buttonMode(ButtonRule.Mode mode) {
    switch (mode) {
      case ALWAYS:
        return BUTTON_ALWAYS;
      case HIDDEN:
        return BUTTON_HIDDEN;
      default:
        return BUTTON_WRITING;
    }
  }

  static String grantCommand(String op) {
    return "adb shell appops set " + PACKAGE + " " + op + " allow";
  }
}
