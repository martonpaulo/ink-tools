package com.supernotetools.lingo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.CheckedTextView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.IOException;
import java.util.List;
import java.util.Set;

/**
 * The app's one screen (#246), opened from the sidebar, the floating button's long press and the
 * system's app preferences: the title with «Close», the active language with «Switch Language»,
 * where the floating button shows (and a reset of where it sits, #244), the languages in the
 * cycle, and any missing permission or service with the command that turns it on. Built in code;
 * black on white, no animation.
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
    page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    int gap = Ink.px(this, Ink.GAP_DP);
    page.setPadding(gap * 2, gap * 2, gap * 2, gap * 2);
    ScrollView scroll = new ScrollView(this);
    scroll.setBackgroundColor(Ink.PAPER);
    scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
    scroll.addView(page);
    setContentView(scroll);
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
    titleRow();
    text(Copy.INTRO, Ink.TEXT_SP, false);
    if (error != null) {
      section(Copy.SWITCH_FAILED);
      text(error, Ink.TEXT_SP, false);
    }
    boolean files = Environment.isExternalStorageManager();
    boolean overlay = Settings.canDrawOverlays(this);
    if (!files) {
      missing(Copy.FILES_OFF, FILES_OP, Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
    }

    section(Copy.ACTIVE);
    List<String> installed = null;
    try {
      String active = Switcher.current();
      text(active == null ? Copy.UNKNOWN : LanguageCycle.name(active) + "  (" + active + ")", Ink.TITLE_SP, true);
      installed = Switcher.installed();
    } catch (IOException readError) {
      text(files ? readError.getMessage() : Copy.FILES_OFF, Ink.TEXT_SP, false);
    }

    Button next = button(Copy.SWITCH_LANGUAGE);
    next.setEnabled(files);
    next.setOnClickListener(view -> switchLanguage());

    Prefs prefs = new Prefs(this);
    section(Copy.BUTTON_SECTION);
    if (!overlay) {
      missing(Copy.OVERLAY_OFF, OVERLAY_OP, Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
    }
    ButtonRule.Mode chosenMode = prefs.button();
    for (ButtonRule.Mode mode : ButtonRule.Mode.values()) {
      CheckedTextView row = check(Copy.buttonMode(mode), mode == chosenMode);
      row.setOnClickListener(view -> {
        setButton(mode);
        render();
      });
    }
    if (chosenMode == ButtonRule.Mode.WRITING && !watcherOn()) {
      text(Copy.WATCHER_OFF, Ink.TEXT_SP, true);
      text(Copy.GRANT_FROM_COMPUTER, Ink.TEXT_SP, false);
      TextView command = text(Copy.WATCHER_COMMANDS, Ink.TEXT_SP, false);
      command.setTypeface(Typeface.MONOSPACE);
      command.setTextIsSelectable(true);
    }
    text(Copy.BUTTON_HELP, Ink.TEXT_SP, false);
    Button reset = button(Copy.RESET_PLACE);
    reset.setOnClickListener(view -> {
      new Prefs(this).clearPlace();
      OverlayService.moveHome();
    });

    section(Copy.CYCLE_SECTION);
    text(Copy.CYCLE_HELP, Ink.TEXT_SP, false);
    if (installed != null) {
      Set<String> chosen = prefs.cycle();
      for (String code : installed) {
        CheckedTextView row = check(LanguageCycle.name(code) + "  (" + code + ")", chosen.contains(code));
        row.setOnClickListener(view -> toggle(code));
      }
    }
    try {
      String version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
      text(Copy.VERSION + " " + version, Ink.TEXT_SP, false);
    } catch (PackageManager.NameNotFoundException impossible) {
      throw new IllegalStateException(impossible);
    }
  }

  /** The title at the leading edge and «Close» at the trailing edge of one line (#246; D69 A). */
  private void titleRow() {
    LinearLayout row = new LinearLayout(this);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setGravity(android.view.Gravity.CENTER_VERTICAL);
    TextView title = new TextView(this);
    title.setText(Copy.TITLE);
    title.setTextColor(Ink.INK);
    title.setTextSize(TypedValue.COMPLEX_UNIT_SP, Ink.TITLE_SP);
    title.setTypeface(Typeface.DEFAULT_BOLD);
    title.setAccessibilityHeading(true);
    row.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
    Button close = outlined(Copy.CLOSE);
    close.setOnClickListener(view -> finish());
    int pad = Ink.px(this, Ink.GAP_DP);
    close.setPadding(pad, 0, pad, 0);
    row.addView(close, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    add(row);
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
    text(what, Ink.TEXT_SP, true);
    text(Copy.GRANT_FROM_COMPUTER, Ink.TEXT_SP, false);
    TextView command = text(Copy.grantCommand(op), Ink.TEXT_SP, false);
    command.setTypeface(Typeface.MONOSPACE);
    command.setTextIsSelectable(true);
    Button open = button(Copy.OPEN_PERMISSION);
    open.setOnClickListener(view -> {
      try {
        startActivity(new Intent(screen, Uri.parse("package:" + getPackageName())));
      } catch (ActivityNotFoundException none) {
        error = Copy.NO_PERMISSION_SCREEN;
        render();
      }
    });
  }

  /** A full-width outlined button, the e-ink look. */
  private Button button(String label) {
    Button view = outlined(label);
    add(view);
    return view;
  }

  /** An outlined button, the e-ink look, not yet placed. */
  private Button outlined(String label) {
    Button view = new Button(this);
    view.setText(label);
    view.setAllCaps(false);
    view.setTextColor(Ink.INK);
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, Ink.TEXT_SP);
    view.setBackground(Ink.box(this, false, 0));
    view.setStateListAnimator(null);
    view.setMinHeight(Ink.px(this, Ink.TARGET_DP));
    return view;
  }

  private void section(String title) {
    TextView view = text(title, Ink.TEXT_SP, true);
    view.setPadding(0, Ink.px(this, Ink.GAP_DP * 2), 0, 0);
  }

  private TextView text(String value, float sp, boolean bold) {
    TextView view = new TextView(this);
    view.setText(value);
    view.setTextColor(Ink.INK);
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
    if (bold) {
      view.setTypeface(Typeface.DEFAULT_BOLD);
    }
    add(view);
    return view;
  }

  /** A row with a square at its start: filled when on, empty when off; no animated check mark. */
  private CheckedTextView check(String label, boolean on) {
    CheckedTextView row = new CheckedTextView(this);
    row.setText(label);
    row.setTextColor(Ink.INK);
    row.setTextSize(TypedValue.COMPLEX_UNIT_SP, Ink.TEXT_SP);
    row.setMinHeight(Ink.px(this, Ink.TARGET_DP));
    row.setGravity(android.view.Gravity.CENTER_VERTICAL);
    StateListDrawable mark = new StateListDrawable();
    mark.addState(new int[] {android.R.attr.state_checked}, Ink.box(this, true, Ink.GAP_DP * 2));
    mark.addState(new int[] {}, Ink.box(this, false, Ink.GAP_DP * 2));
    mark.setExitFadeDuration(0);
    mark.setEnterFadeDuration(0);
    row.setCheckMarkDrawable(null);
    row.setCompoundDrawablesRelativeWithIntrinsicBounds(mark, null, null, null);
    row.setCompoundDrawablePadding(Ink.px(this, Ink.GAP_DP));
    row.setChecked(on);
    add(row);
    return row;
  }

  private void add(View view) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    params.topMargin = Ink.px(this, Ink.GAP_DP / 2);
    page.addView(view, params);
  }
}
