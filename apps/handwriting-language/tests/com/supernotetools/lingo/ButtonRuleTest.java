package com.supernotetools.lingo;

import com.supernotetools.lingo.ButtonRule.Mode;

/** Plain JVM test, no framework: run by `node scripts/build.cjs --test` (#195). */
public final class ButtonRuleTest {
  private static final String NOTE = "com.ratta.supernote.note.NoteInsidePagesActivity";
  private static final String SETTINGS = "com.android.settings.Settings";

  public static void main(String[] args) {
    check(ButtonRule.visible(Mode.WRITING, false, true, true, false, SETTINGS), "the keyboard open shows the button anywhere");
    for (Mode mode : Mode.values()) {
      check(!ButtonRule.visible(mode, true, true, true, false, NOTE), mode + ": the app's own screen in front hides the button (#275)");
    }
    check(ButtonRule.visible(Mode.WRITING, false, true, false, false, NOTE), "a note page in front shows the button");
    for (String screen : ButtonRule.WRITING_SCREENS) {
      check(ButtonRule.visible(Mode.WRITING, false, true, false, false, "x.y." + screen), screen + " shows the button");
    }
    check(!ButtonRule.visible(Mode.WRITING, false, true, false, false, SETTINGS), "Settings without the keyboard hides it");
    check(!ButtonRule.visible(Mode.WRITING, false, true, false, false, null), "an unknown foreground hides it");
    check(!ButtonRule.visible(Mode.WRITING, false, true, false, false, "x.NoteInsidePagesActivityX"), "only the exact class name counts");
    check(ButtonRule.visible(Mode.WRITING, false, false, false, false, SETTINGS), "with the service off the button shows everywhere");

    check(!ButtonRule.visible(Mode.WRITING, false, true, false, true, NOTE), "a plugin view over a note page hides it (#415)");
    check(!ButtonRule.visible(Mode.WRITING, false, true, false, true, SETTINGS), "a plugin's Settings view hides it (#415)");
    check(ButtonRule.visible(Mode.WRITING, false, true, true, true, NOTE), "the keyboard open in a plugin view shows it");
    check(!ButtonRule.visible(Mode.ALWAYS, false, true, false, true, NOTE), "always visible hides it over a plugin view too (#557)");
    check(ButtonRule.visible(Mode.ALWAYS, false, true, true, true, NOTE), "always visible shows it with the keyboard open in a plugin view");
    check(ButtonRule.isPluginView("com.ratta.supernote.pluginhost"), "PluginHost's window is a plugin view");
    check(!ButtonRule.isPluginView("com.ratta.supernote.note"), "the note app's window is none");
    check(!ButtonRule.isPluginView(null), "a window with no package is none");
    check(ButtonRule.isPluginWindow(null, "com.ratta.supernote.pluginhost"), "PluginHost's window with no root content counts by its title (#415)");
    check(ButtonRule.isPluginWindow("com.ratta.supernote.pluginhost", null), "PluginHost's window counts by its root package");
    check(!ButtonRule.isPluginWindow("com.ratta.settings", "Settings"), "the Settings window is none");
    check(!ButtonRule.isPluginWindow(null, null), "a window with neither is none");
    check(ButtonRule.windowEntry(2002, null, null).equals("2002:-:-"), "a log entry marks what is missing");

    check(ButtonRule.visible(Mode.ALWAYS, false, true, false, false, SETTINGS), "always visible shows it in Settings");
    check(!ButtonRule.visible(Mode.HIDDEN, false, true, true, false, NOTE), "hidden never shows it");
    check(!ButtonRule.visible(Mode.HIDDEN, false, false, false, false, null), "hidden stays hidden with the service off");

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
