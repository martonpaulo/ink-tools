package com.supernotetools.lingo;

import com.supernotetools.lingo.ButtonRule.Mode;

/** Plain JVM test, no framework: run by `node scripts/build.cjs --test` (#195). */
public final class ButtonRuleTest {
  private static final String NOTE = "com.ratta.supernote.note.NoteInsidePagesActivity";
  private static final String SETTINGS = "com.android.settings.Settings";

  public static void main(String[] args) {
    check(ButtonRule.visible(Mode.WRITING, false, true, true, SETTINGS), "the keyboard open shows the button anywhere");
    for (Mode mode : Mode.values()) {
      check(!ButtonRule.visible(mode, true, true, true, NOTE), mode + ": the app's own screen in front hides the button (#275)");
    }
    check(ButtonRule.visible(Mode.WRITING, false, true, false, NOTE), "a note page in front shows the button");
    for (String screen : ButtonRule.WRITING_SCREENS) {
      check(ButtonRule.visible(Mode.WRITING, false, true, false, "x.y." + screen), screen + " shows the button");
    }
    check(!ButtonRule.visible(Mode.WRITING, false, true, false, SETTINGS), "Settings without the keyboard hides it");
    check(!ButtonRule.visible(Mode.WRITING, false, true, false, null), "an unknown foreground hides it");
    check(!ButtonRule.visible(Mode.WRITING, false, true, false, "x.NoteInsidePagesActivityX"), "only the exact class name counts");
    check(ButtonRule.visible(Mode.WRITING, false, false, false, SETTINGS), "with the service off the button shows everywhere");

    check(ButtonRule.visible(Mode.ALWAYS, false, true, false, SETTINGS), "always visible shows it in Settings");
    check(!ButtonRule.visible(Mode.HIDDEN, false, true, true, NOTE), "hidden never shows it");
    check(!ButtonRule.visible(Mode.HIDDEN, false, false, false, null), "hidden stays hidden with the service off");

    check(ButtonRule.isWritingScreen("TaskActivity"), "a simple class name matches");
    check(!ButtonRule.isWritingScreen(null), "null is no screen");

    check(ButtonRule.restartsOn("android.intent.action.BOOT_COMPLETED", Mode.WRITING), "a tablet restart starts the button again");
    check(ButtonRule.restartsOn("android.intent.action.MY_PACKAGE_REPLACED", Mode.ALWAYS), "an app update starts the button again");
    check(!ButtonRule.restartsOn("android.intent.action.MY_PACKAGE_REPLACED", Mode.HIDDEN), "a hidden button stays off after an update");
    check(!ButtonRule.restartsOn("android.intent.action.SCREEN_ON", Mode.ALWAYS), "another event starts nothing");
    check(!ButtonRule.restartsOn(null, Mode.ALWAYS), "no action starts nothing");

    check(ButtonRule.mode(null) == Mode.WRITING, "the default is only where you write");
    check(ButtonRule.mode("bogus") == Mode.WRITING, "an unknown key is the default");
    for (Mode mode : Mode.values()) {
      check(ButtonRule.mode(mode.key) == mode, mode.key + " round-trips");
    }
    System.out.println("ButtonRuleTest ok");
  }

  static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
