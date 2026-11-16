package com.supernotetools.lingo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Surface A: a small button at the right screen edge over other apps
 * (`TYPE_APPLICATION_OVERLAY`, SYSTEM_ALERT_WINDOW). It shows the active language's short code;
 * one tap moves to the next, a long press opens the settings screen. ButtonRule says when it
 * shows, from what WritingWatcher reads (#195). A foreground service, so the system keeps it while
 * other apps run; the service runs unless the button is hidden.
 */
public final class OverlayService extends Service {
  private static final String CHANNEL = "overlay";
  private static final int NOTIFICATION_ID = 1;
  /** Where lane 4's test button sat (docs/research/2026-11-handwriting-language.md § 10). */
  private static final int TOP_PX = 600;

  /** The running service, so WritingWatcher can ask it to show or hide; main thread only. */
  private static OverlayService running;

  private WindowManager windows;
  private WindowManager.LayoutParams params;
  private TextView button;
  private boolean attached;
  private final BroadcastReceiver changed = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      show(null);
    }
  };

  static void start(Context context) {
    context.startForegroundService(new Intent(context, OverlayService.class));
  }

  static void stop(Context context) {
    context.stopService(new Intent(context, OverlayService.class));
  }

  /** Shows or hides the button after a window event or a settings change. */
  static void refresh() {
    if (running != null) {
      running.place();
    }
  }

  @Override
  public void onCreate() {
    super.onCreate();
    NotificationManager notifications = getSystemService(NotificationManager.class);
    notifications.createNotificationChannel(
        new NotificationChannel(CHANNEL, Copy.NOTIFICATION, NotificationManager.IMPORTANCE_MIN));
    startForeground(NOTIFICATION_ID, new Notification.Builder(this, CHANNEL)
        .setSmallIcon(android.R.drawable.ic_menu_edit)
        .setContentTitle(Copy.NOTIFICATION)
        .build());
    if (!Settings.canDrawOverlays(this)) {
      Log.e(Switcher.TAG, "surface=overlay error=" + Copy.OVERLAY_OFF);
      stopSelf();
      return;
    }
    windows = getSystemService(WindowManager.class);
    button = new TextView(this);
    button.setGravity(Gravity.CENTER);
    button.setTextColor(Ink.INK);
    button.setTypeface(Typeface.DEFAULT_BOLD);
    button.setTextSize(TypedValue.COMPLEX_UNIT_SP, Ink.BUTTON_SP);
    button.setBackground(Ink.box(this, false, 0));
    button.setOnClickListener(view -> tap());
    button.setOnLongClickListener(view -> {
      startActivity(new Intent(this, SettingsActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      return true;
    });
    int size = Ink.px(this, Ink.TARGET_DP);
    params = new WindowManager.LayoutParams(
        size, size,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.OPAQUE);
    params.gravity = Gravity.TOP | Gravity.END;
    params.y = TOP_PX;
    params.windowAnimations = 0;
    registerReceiver(changed, new IntentFilter(Switcher.CHANGED));
    show(null);
    running = this;
    place();
  }

  /**
   * Adds or removes the button's window as ButtonRule says. Removed, not made invisible: a
   * hidden view keeps its window, which would still take the pen strokes over its box.
   */
  private void place() {
    boolean visible = ButtonRule.visible(new Prefs(this).button(), WritingWatcher.watching(),
        WritingWatcher.keyboardOpen(), WritingWatcher.foreground());
    if (visible == attached) {
      return;
    }
    if (visible) {
      windows.addView(button, params);
    } else {
      windows.removeView(button);
    }
    attached = visible;
    Log.i(Switcher.TAG, "surface=overlay " + (visible ? "shown" : "hidden")
        + " keyboard=" + WritingWatcher.keyboardOpen() + " foreground=" + WritingWatcher.foreground());
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    return START_STICKY;
  }

  private void tap() {
    try {
      show(Switcher.next(this, "overlay"));
    } catch (IOException error) {
      failed();
    }
  }

  /** Shows `code`, or reads the active one when null. */
  private void show(String code) {
    if (button == null) {
      return;
    }
    try {
      String active = code != null ? code : Switcher.current();
      List<String> cycle = new ArrayList<>(Switcher.installed());
      cycle.retainAll(new Prefs(this).cycle());
      if (active == null) {
        failed();
        return;
      }
      button.setText(LanguageCycle.label(active, cycle));
      button.setContentDescription(String.format(Copy.BUTTON_DESCRIPTION, LanguageCycle.name(active)));
    } catch (IOException error) {
      failed();
    }
  }

  private void failed() {
    button.setText(Copy.BUTTON_FAILED);
    button.setContentDescription(Copy.BUTTON_FAILED_DESCRIPTION);
  }

  @Override
  public void onDestroy() {
    if (button != null) {
      running = null;
      unregisterReceiver(changed);
      if (attached) {
        windows.removeView(button);
      }
      attached = false;
      button = null;
    }
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
