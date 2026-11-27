package com.supernotetools.lingo;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Every visible text of the app, in English (root AGENTS.md › Product copy). The launcher
 * label lives in the manifest, which scripts/build.cjs writes, since a manifest cannot read Java.
 * The app shows its feature name, Handwriting Language; Lingo stays its internal name (#176).
 */
final class Copy {
  private Copy() {}

  static final String PACKAGE = "com.supernotetools.lingo";
  static final String TITLE = "Handwriting Language";
  static final String ACTIVE = "Active Language";
  static final String SWITCH_LANGUAGE = "Switch to Next Language";
  static final String CLOSE = "Close";
  static final String NOT_READ = "Not read: All-files access is off.";
  static final String TURNED_OFF = "Turned off in this version";
  static final String FOLDER_NOT_READ = "Not read: the language folder could not be read.";
  static final String UNKNOWN = "Unknown: the language folder holds more than one language.";
  static final String BUTTON_SECTION = "Floating Button";
  static final String BUTTON_WRITING = "Where You Write";
  static final String BUTTON_WRITING_DETAIL = "The handwriting keyboard, notes, Digest, To-Do and Email";
  static final String BUTTON_ALWAYS = "Always";
  static final String BUTTON_ALWAYS_DETAIL = "Over every app";
  static final String BUTTON_HIDDEN = "Hidden";
  static final String BUTTON_HELP = "One tap switches to the next language; a long press opens this screen; drag it to move it. It hides while this screen is open.";
  static final String RESET_PLACE = "Reset Button Position";
  static final String WATCHER_OFF = "Writing detection is off, so the floating button shows over every app.";
  /** What the service reads, said before the system's «full control» warning; the steps on its screen. */
  static final String WATCHER_STEPS = "Writing detection is an accessibility service: it reads only which apps and windows are open, "
      + "never what they show. Open Accessibility Settings, tap " + TITLE + ", turn on Use " + TITLE + ", then tap Allow.";
  static final String OPEN_WATCHER_SETTINGS = "Open Accessibility Settings";
  static final String CYCLE_SECTION = "Languages in the Cycle";
  static final String CYCLE_HELP = "Only installed languages are listed.";
  static final String INSTALL_LANGUAGES = "Handwriting Recognition Language";
  static final String INSTALL_PATH = "Install more in Settings › Display & Input › Language & Region › Handwriting Recognition Language.";
  static final String NO_LANGUAGE_SCREEN = "This tablet has no Handwriting Recognition Language screen to open.";
  static final String CYCLE_NOT_READ = "The language folder could not be read, so the languages cannot be listed. Close this screen and open it again; if it still fails, restart the tablet.";
  static final String CYCLE_NO_FILES = "Turn on All-files access above to list the languages.";
  static final String CYCLE_LAST = "Keep at least one language in the cycle.";
  static final String FILES_OFF = "All-files access is off, so the language cannot be switched.";
  static final String OVERLAY_OFF = "Display over other apps is off, so the floating button cannot show.";
  static final String OPEN_FILES_PERMISSION = "Open All-Files Access Settings";
  static final String OPEN_OVERLAY_PERMISSION = "Open Display Over Apps Settings";
  static final String NO_PERMISSION_SCREEN = "This tablet did not open the settings screen. Open the tablet's Settings and turn it on there for " + TITLE + ".";
  static final String SWITCH_FAILED = "The last switch failed:";
  static final String VERSION = "Version";
  static final String NOTIFICATION = "Handwriting Language floating button";
  static final String BUTTON_FAILED = "!";
  static final String BUTTON_DESCRIPTION = "Handwriting language %s. Tap to switch to the next language.";
  static final String BUTTON_FAILED_DESCRIPTION = "The language could not be switched. Open Handwriting Language from the sidebar.";

  static final String FAILURE_CANNOT_READ = "The language folder could not be read. Close this screen and open it again; if it still fails, restart the tablet.";
  static final String FAILURE_CANNOT_CREATE = "The new language could not be set. Tap Switch to Next Language again; if it keeps failing, restart the tablet.";
  static final String FAILURE_CANNOT_DELETE = "The switch did not finish, so two languages are set. Tap Switch to Next Language again; if it keeps failing, restart the tablet.";
  static final String FAILURE_NOT_INSTALLED = "That language is not installed. Install it in Settings › Display & Input › Language & Region › Handwriting Recognition Language, then try again.";
  static final String FAILURE_NOTHING_TO_CYCLE = "None of the languages in the cycle is installed. Install one in Settings › Display & Input › Language & Region › Handwriting Recognition Language, or turn on an installed language below.";
  static final String FAILURE_TURNED_OFF = "Language switching is turned off in this version because a tablet update changed how the language is stored, so update Ink Tools to turn it on again.";
  static final String FAILURE_OTHER = "The language could not be switched. Try again, or restart the tablet if it keeps failing.";

  static String failure(FileFailure.Kind kind) {
    switch (kind) {
      case CANNOT_READ:
        return FAILURE_CANNOT_READ;
      case CANNOT_CREATE:
        return FAILURE_CANNOT_CREATE;
      case CANNOT_DELETE:
        return FAILURE_CANNOT_DELETE;
      case NOT_INSTALLED:
        return FAILURE_NOT_INSTALLED;
      case NOTHING_TO_CYCLE:
        return FAILURE_NOTHING_TO_CYCLE;
      case FILES_OFF:
        return FILES_OFF;
      case TURNED_OFF:
        return FAILURE_TURNED_OFF;
      default:
        return FAILURE_OTHER;
    }
  }

  /** Each failure sentence by its kind's name: the copy keys of the adapter's InternalFailure (#294). */
  static final Map<String, String> FAILURES = failures();

  private static Map<String, String> failures() {
    Map<String, String> sentences = new LinkedHashMap<>();
    for (FileFailure.Kind kind : FileFailure.Kind.values()) {
      sentences.put(kind.name(), failure(kind));
    }
    return Collections.unmodifiableMap(sentences);
  }

  /** The detail under a floating-button choice, or null for none. */
  static String buttonModeDetail(ButtonRule.Mode mode) {
    switch (mode) {
      case ALWAYS:
        return BUTTON_ALWAYS_DETAIL;
      case HIDDEN:
        return null;
      default:
        return BUTTON_WRITING_DETAIL;
    }
  }

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
}
