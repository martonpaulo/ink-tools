package com.supernotetools.lingo;

import com.supernotetools.lingo.ButtonRule.Mode;

/** Plain JVM test, no framework: run by `node scripts/build.cjs --test` (#195). */
public final class ButtonRuleTest {
  private static final String NOTE = "com.ratta.supernote.note.NoteInsidePagesActivity";
  private static final String SETTINGS = "com.android.settings.Settings";

  public static void main(String[] args) {
    check(ButtonRule.visible(Mode.WRITING, true, true, SETTINGS), "the keyboard open shows the button anywhere");
    check(ButtonRule.visible(Mode.WRITING, true, false, NOTE), "a note page in front shows the button");
    for (String screen : ButtonRule.WRITING_SCREENS) {
      check(ButtonRule.visible(Mode.WRITING, true, false, "x.y." + screen), screen + " shows the button");
    }
    check(!ButtonRule.visible(Mode.WRITING, true, false, SETTINGS), "Settings without the keyboard hides it");
    check(!ButtonRule.visible(Mode.WRITING, true, false, null), "an unknown foreground hides it");
    check(!ButtonRule.visible(Mode.WRITING, true, false, "x.NoteInsidePagesActivityX"), "only the exact class name counts");
    check(ButtonRule.visible(Mode.WRITING, false, false, SETTINGS), "with the service off the button shows everywhere");

    check(ButtonRule.visible(Mode.ALWAYS, true, false, SETTINGS), "always visible shows it in Settings");
    check(!ButtonRule.visible(Mode.HIDDEN, true, true, NOTE), "hidden never shows it");
    check(!ButtonRule.visible(Mode.HIDDEN, false, false, null), "hidden stays hidden with the service off");

    check(ButtonRule.isWritingScreen("TaskActivity"), "a simple class name matches");
    check(!ButtonRule.isWritingScreen(null), "null is no screen");

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
