package com.supernotetools.lingo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * The app's one screen (#246), opened from the sidebar, the floating button's long press and the
 * system's app preferences, drawn with the Supernote's native controls (`Ink`, #275): the title
 * bar with × to close, the active language with «Switch Language», where the floating button
 * shows as radio rows (and a reset of where it sits, #244), a switch row for each installed
 * language in the cycle, and any missing permission or service with the command that turns it on.
 * Built in code; black on white, no animation.
 *
 * Extras, for a device round over ADB: `--es button writing|always|hidden` sets the floating
 * button (ButtonRule.Mode keys).
 */
public final class SettingsActivity extends Activity {
  static final String EXTRA_BUTTON = "button";
  private static final String FILES_OP = "MANAGE_EXTERNAL_STORAGE";
  private static final String OVERLAY_OP = "SYSTEM_ALERT_WINDOW";

  /** Where the last error shows: beside the control whose action failed (#275). */
  private enum Place { SWITCH, PERMISSION, CYCLE }

  private LinearLayout page;
  private String error;
  private Place errorPlace;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setWindowAnimations(0);
    readExtras(getIntent());
    LinearLayout screen = new LinearLayout(this);
    screen.setOrientation(LinearLayout.VERTICAL);
    screen.setBackgroundColor(Ink.PAPER);
    screen.addView(Ink.titleBar(this, Copy.TITLE, Copy.CLOSE, this::finish), new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    int space = Ink.space(this);
    page.setPadding(space, space, space, space);
    ScrollView scroll = new ScrollView(this);
    scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
    scroll.addView(page);
    screen.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
    setContentView(screen);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    readExtras(intent);
  }

  @Override
  protected void onResume() {
    super.onResume();
    render();
  }

  private void readExtras(Intent intent) {
    if (intent.hasExtra(EXTRA_BUTTON)) {
      setButton(ButtonRule.mode(intent.getStringExtra(EXTRA_BUTTON)));
    }
  }

  /**
   * Rebuilt on each resume, since a permission may have changed in between. Each section is one
   * group (`Ink.group`): its caption, its rows, then the note that explains it; a missing
   * permission or an error follows under it, so no text sits between a caption and its rows (#275).
   */
  private void render() {
    page.removeAllViews();
    add(Ink.text(this, Copy.INTRO, false));
    boolean files = Environment.isExternalStorageManager();
    boolean overlay = Settings.canDrawOverlays(this);

    List<String> installed = null;
    String active = null;
    String readFailure = null;
    try {
      active = Switcher.current();
      installed = Switcher.installed();
    } catch (IOException readError) {
      readFailure = FileFailure.sentence(readError);
    }
    Button next = Ink.button(this, Copy.SWITCH_LANGUAGE, true, files);
    next.setOnClickListener(view -> switchLanguage());
    String language = active == null ? Copy.UNKNOWN : LanguageCycle.name(active);
    String title = readFailure == null ? language : files ? readFailure : Copy.NOT_READ;
    addGroup(Ink.group(this, Copy.ACTIVE, Collections.singletonList(Ink.actionRow(this, title, next)), null));
    if (!files) {
      missing(Copy.FILES_OFF, Copy.OPEN_FILES_PERMISSION, FILES_OP, Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
    }
    errorAt(Place.SWITCH, Copy.SWITCH_FAILED);

    Prefs prefs = new Prefs(this);
    ButtonRule.Mode chosenMode = prefs.button();
    List<View> modes = new ArrayList<>();
    for (ButtonRule.Mode mode : ButtonRule.Mode.values()) {
      LinearLayout row = Ink.radioRow(this, Copy.buttonMode(mode), mode == chosenMode);
      row.setOnClickListener(view -> {
        setButton(mode);
        render();
      });
      modes.add(row);
    }
    addGroup(Ink.group(this, Copy.BUTTON_SECTION, modes, Copy.BUTTON_HELP));
    if (!overlay) {
      missing(Copy.OVERLAY_OFF, Copy.OPEN_OVERLAY_PERMISSION, OVERLAY_OP, Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
    }
    if (chosenMode == ButtonRule.Mode.WRITING && !watcherOn()) {
      bold(Copy.WATCHER_OFF);
      add(Ink.text(this, Copy.WATCHER_FROM_COMPUTER, false));
      command(Copy.WATCHER_COMMANDS);
    }
    boolean shown = overlay && chosenMode != ButtonRule.Mode.HIDDEN;
    Button reset = Ink.button(this, Copy.RESET_PLACE, false, shown);
    reset.setOnClickListener(view -> {
      new Prefs(this).clearPlace();
      OverlayService.moveHome();
    });
    addButton(reset);
    if (chosenMode == ButtonRule.Mode.HIDDEN) {
      add(Ink.text(this, Copy.RESET_OFF, true));
    }

    List<View> languages = new ArrayList<>();
    if (installed != null) {
      Set<String> chosen = prefs.cycle();
      for (String code : installed) {
        // The name only: a code such as pt_BR stays in the log and the preferences (owner, #275).
        LinearLayout row = Ink.switchRow(this, LanguageCycle.name(code), chosen.contains(code));
        row.setOnClickListener(view -> toggle(code));
        languages.add(row);
      }
    }
    // An unread folder lists no language: say so, not that none is installed (#275).
    String cycleNote = !files ? Copy.CYCLE_NO_FILES : installed == null ? Copy.CYCLE_NOT_READ : Copy.CYCLE_HELP;
    addGroup(Ink.group(this, Copy.CYCLE_SECTION, languages, cycleNote));
    errorAt(Place.CYCLE, null);
    try {
      String version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
      add(Ink.text(this, Copy.VERSION + " " + version, true));
    } catch (PackageManager.NameNotFoundException impossible) {
      throw new IllegalStateException(impossible);
    }
  }

  /** «Switch Language»: the next language in the cycle, as a tap on the floating button does. */
  private void switchLanguage() {
    try {
      Switcher.next(this, "screen");
      error = null;
    } catch (IOException switchError) {
      fail(Place.SWITCH, FileFailure.sentence(switchError));
      return;
    }
    render();
  }

  private void setButton(ButtonRule.Mode mode) {
    new Prefs(this).setButton(mode);
    if (mode == ButtonRule.Mode.HIDDEN) {
      OverlayService.stop(this);
    } else {
      OverlayService.start(this);
      OverlayService.refresh();
    }
  }

  /** Whether the system lists WritingWatcher as enabled, which the ADB command sets. */
  private boolean watcherOn() {
    String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
    if (enabled == null) {
      return false;
    }
    ComponentName watcher = new ComponentName(this, WritingWatcher.class);
    for (String entry : enabled.split(":")) {
      if (watcher.equals(ComponentName.unflattenFromString(entry))) {
        return true;
      }
    }
    return false;
  }

  private void toggle(String code) {
    Prefs prefs = new Prefs(this);
    Set<String> chosen = prefs.cycle();
    if (chosen.contains(code)) {
      chosen.remove(code);
    } else {
      chosen.add(code);
    }
    try {
      List<String> left = Switcher.installed();
      left.retainAll(chosen);
      if (left.isEmpty()) {
        fail(Place.CYCLE, Copy.CYCLE_LAST);
        return;
      }
    } catch (IOException readError) {
      fail(Place.CYCLE, FileFailure.sentence(readError));
      return;
    }
    error = null;
    prefs.setCycle(chosen);
    render();
    // The button's label depends on the cycle (CN and TW when both Chinese codes are in it).
    if (prefs.button() != ButtonRule.Mode.HIDDEN) {
      sendBroadcast(new Intent(Switcher.CHANGED).setPackage(getPackageName()));
    }
  }

  /** A missing permission: what it stops, the button to its system screen, then the ADB command. */
  private void missing(String what, String open, String op, String screen) {
    bold(what);
    Button button = Ink.button(this, open, false, true);
    button.setOnClickListener(view -> {
      try {
        startActivity(new Intent(screen, Uri.parse("package:" + getPackageName())));
      } catch (ActivityNotFoundException none) {
        fail(Place.PERMISSION, Copy.NO_PERMISSION_SCREEN);
      }
    });
    addButton(button);
    errorAt(Place.PERMISSION, null);
    add(Ink.text(this, Copy.GRANT_FROM_COMPUTER, false));
    command(Copy.grantCommand(op));
  }

  private void fail(Place place, String message) {
    error = message;
    errorPlace = place;
    render();
  }

  /** The last error, in bold ink, when it belongs here, under its own heading when it has one. */
  private void errorAt(Place place, String heading) {
    if (error == null || errorPlace != place) {
      return;
    }
    if (heading != null) {
      bold(heading);
    }
    bold(error);
  }

  private void bold(String value) {
    TextView view = Ink.text(this, value, false);
    view.setTypeface(Typeface.DEFAULT_BOLD);
    add(view);
  }

  /** A command to type on the computer: monospace and selectable. */
  private void command(String value) {
    TextView view = Ink.text(this, value, false);
    view.setTypeface(Typeface.MONOSPACE);
    view.setTextIsSelectable(true);
    add(view);
  }

  /** A full-width view, one spacing step under the one before. */
  private void add(View view) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    params.topMargin = Ink.space(this);
    page.addView(view, params);
  }

  /** A group of rows: it carries the gap above it, so the page adds none of its own. */
  private void addGroup(View group) {
    page.addView(group, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
  }

  /** A button at its own width at the trailing edge, as OK sits in the system dialogs (ui-kit `shared.actions`). */
  private void addButton(Button button) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    params.gravity = android.view.Gravity.END;
    params.topMargin = Ink.space(this);
    page.addView(button, params);
  }
}
