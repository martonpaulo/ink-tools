package com.supernotetools.dialect;

/**
 * Every visible text of the app, in English (root AGENTS.md › Product copy). The two launcher
 * labels live in the manifest, which scripts/build.cjs writes, since a manifest cannot read Java.
 */
final class Copy {
  private Copy() {}

  static final String PACKAGE = "com.supernotetools.dialect";
  static final String TITLE = "Dialect";
  static final String INTRO = "Switches the handwriting recognition language of the whole tablet.";
  static final String ACTIVE = "Active language";
  static final String UNKNOWN = "Unknown: the language folder holds more than one language.";
  static final String BUTTON_SECTION = "Floating button";
  static final String BUTTON_SHOW = "Show the floating button over every app";
  static final String BUTTON_HELP = "One tap moves to the next language. The Dialect entry in the sidebar does the same with nothing on screen.";
  static final String CYCLE_SECTION = "Languages in the cycle";
  static final String CYCLE_HELP = "Only installed languages are listed. Install more in Settings, Handwriting language.";
  static final String CYCLE_LAST = "Keep at least one language in the cycle.";
  static final String FILES_OFF = "All-files access is off, so Dialect cannot switch the language.";
  static final String OVERLAY_OFF = "Display over other apps is off, so the floating button cannot show.";
  static final String GRANT_FROM_COMPUTER = "Grant it from the computer:";
  static final String OPEN_PERMISSION = "Open the permission screen";
  static final String NO_PERMISSION_SCREEN = "This tablet has no screen for this permission. Use the command above.";
  static final String SWITCH_FAILED = "The last switch failed:";
  static final String VERSION = "Version";
  static final String NOTIFICATION = "Dialect floating button";
  static final String BUTTON_FAILED = "!";
  static final String BUTTON_DESCRIPTION = "Handwriting language %s. Tap to switch to the next language.";
  static final String BUTTON_FAILED_DESCRIPTION = "Dialect could not switch the language. Open Dialect settings.";

  static String grantCommand(String op) {
    return "adb shell appops set " + PACKAGE + " " + op + " allow";
  }
}
