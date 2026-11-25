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
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.IOException;
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

  private LinearLayout page;
  private String error;

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

  /** Rebuilt on each resume, since a permission may have changed in between. */
  private void render() {
    page.removeAllViews();
    add(Ink.text(this, Copy.INTRO, false));
    if (error != null) {
      add(Ink.caption(this, Copy.SWITCH_FAILED));
      add(Ink.text(this, error, false));
    }
    boolean files = Environment.isExternalStorageManager();
    boolean overlay = Settings.canDrawOverlays(this);
    if (!files) {
      missing(Copy.FILES_OFF, FILES_OP, Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
    }

    add(Ink.caption(this, Copy.ACTIVE));
    List<String> installed = null;
    try {
      String active = Switcher.current();
      TextView name = Ink.text(this, active == null ? Copy.UNKNOWN : LanguageCycle.name(active) + "  (" + active + ")", false);
      name.setTextSize(TypedValue.COMPLEX_UNIT_SP, Ink.largeSp(this));
      add(name);
      installed = Switcher.installed();
    } catch (IOException readError) {
      add(Ink.text(this, files ? readError.getMessage() : Copy.FILES_OFF, false));
    }
    Button next = Ink.button(this, Copy.SWITCH_LANGUAGE, true, files);
    next.setOnClickListener(view -> switchLanguage());
    addButton(next);

    Prefs prefs = new Prefs(this);
    add(Ink.caption(this, Copy.BUTTON_SECTION));
    if (!overlay) {
      missing(Copy.OVERLAY_OFF, OVERLAY_OP, Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
    }
    ButtonRule.Mode chosenMode = prefs.button();
    for (ButtonRule.Mode mode : ButtonRule.Mode.values()) {
      LinearLayout row = Ink.radioRow(this, Copy.buttonMode(mode), mode == chosenMode);
      row.setOnClickListener(view -> {
        setButton(mode);
        render();
      });
      add(row);
    }
    if (chosenMode == ButtonRule.Mode.WRITING && !watcherOn()) {
      bold(Copy.WATCHER_OFF);
      add(Ink.text(this, Copy.GRANT_FROM_COMPUTER, false));
      command(Copy.WATCHER_COMMANDS);
    }
    add(Ink.text(this, Copy.BUTTON_HELP, true));
    Button reset = Ink.button(this, Copy.RESET_PLACE, false, true);
    reset.setOnClickListener(view -> {
      new Prefs(this).clearPlace();
      OverlayService.moveHome();
    });
    addButton(reset);

    add(Ink.caption(this, Copy.CYCLE_SECTION));
    add(Ink.text(this, Copy.CYCLE_HELP, true));
    if (installed != null) {
      Set<String> chosen = prefs.cycle();
      for (String code : installed) {
        LinearLayout row = Ink.switchRow(this, LanguageCycle.name(code), code, chosen.contains(code));
        row.setOnClickListener(view -> toggle(code));
        add(row);
      }
    }
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
      error = switchError.getMessage();
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
        error = Copy.CYCLE_LAST;
        render();
        return;
      }
    } catch (IOException readError) {
      error = readError.getMessage();
      render();
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

  private void missing(String what, String op, String screen) {
    bold(what);
    add(Ink.text(this, Copy.GRANT_FROM_COMPUTER, false));
    command(Copy.grantCommand(op));
    Button open = Ink.button(this, Copy.OPEN_PERMISSION, false, true);
    open.setOnClickListener(view -> {
      try {
        startActivity(new Intent(screen, Uri.parse("package:" + getPackageName())));
      } catch (ActivityNotFoundException none) {
        error = Copy.NO_PERMISSION_SCREEN;
        render();
      }
    });
    addButton(open);
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

  /** A button at its own width, at the leading edge, one spacing step under the view before. */
  private void addButton(Button button) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    params.topMargin = Ink.space(this);
    page.addView(button, params);
  }
}
