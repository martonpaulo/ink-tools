package com.supernotetools.lingo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Surface A: a small button over other apps (`TYPE_APPLICATION_OVERLAY`, SYSTEM_ALERT_WINDOW),
 * at the top trailing corner until the owner drags it elsewhere (#244). It shows the active
 * language's short code; one tap moves to the next, a long press opens the settings screen, a
 * drag moves it (ButtonGesture tells them apart, ButtonPlace keeps it on screen). ButtonRule says
 * when it shows, from what WritingWatcher reads (#195). A foreground service, so the system keeps
 * it while other apps run; the service runs unless the button is hidden.
 */
public final class OverlayService extends Service {
  private static final String CHANNEL = "overlay";
  private static final int NOTIFICATION_ID = 1;

  /** The running service, so WritingWatcher can ask it to show or hide; main thread only. */
  private static OverlayService running;

  private WindowManager windows;
  private WindowManager.LayoutParams params;
  private TextView button;
  private boolean attached;
  private ButtonGesture gesture;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final Runnable longPress = () -> {
    if (button != null && gesture.longPressDue(SystemClock.uptimeMillis())) {
      button.performLongClick();
    }
  };
  /** The window's place when the touch began, so a drag moves it by the touch's offset. */
  private int startX;
  private int startY;
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

  /** Puts the button back at its default place after Settings resets it; nothing while it is off. */
  static void moveHome() {
    if (running != null) {
      running.moveToSaved();
    }
  }

  /** Whether the app's own screen is in front: the button then hides, so it covers none of its controls (#275). */
  private static boolean ownScreenOpen;

  /** The settings screen calls this when it comes to the front (true) and when it leaves it (false). */
  static void ownScreen(boolean open) {
    ownScreenOpen = open;
    refresh();
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
    button.setTextSize(TypedValue.COMPLEX_UNIT_SP, Ink.sp(this, Ink.Role.ROW_TITLE.fontMm));
    button.setBackground(Ink.outline(this, Ink.PAPER, Ink.INK, false));
    // The click and long-click listeners stay for accessibility actions; touch() calls them.
    button.setOnClickListener(view -> tap());
    button.setOnLongClickListener(view -> {
      startActivity(new Intent(this, SettingsActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      return true;
    });
    ViewConfiguration touch = ViewConfiguration.get(this);
    gesture = new ButtonGesture(touch.getScaledTouchSlop(), ViewConfiguration.getLongPressTimeout());
    button.setOnTouchListener(this::touch);
    int size = Ink.target(this);
    params = new WindowManager.LayoutParams(
        size, size,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        // In screen: x and y are screen pixels, as the touch's raw points and the window metrics are.
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.OPAQUE);
    params.gravity = Gravity.TOP | Gravity.LEFT;
    params.windowAnimations = 0;
    moveToSaved();
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
    boolean visible = ButtonRule.visible(new Prefs(this).button(), ownScreenOpen, WritingWatcher.watching(),
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

  /** The screen turned or changed size: the same fractions, on the new screen. */
  @Override
  public void onConfigurationChanged(Configuration changed) {
    super.onConfigurationChanged(changed);
    if (button != null) {
      moveToSaved();
    }
  }

  /** Places the window at the saved fractions, or the default top trailing corner. */
  private void moveToSaved() {
    Rect screen = windows.getCurrentWindowMetrics().getBounds();
    float[] place = new Prefs(this).place();
    float x = place != null ? place[0] : ButtonPlace.DEFAULT_X;
    float y = place != null ? place[1] : ButtonPlace.defaultY(screen.height(), params.height);
    moveTo(ButtonPlace.pixels(x, screen.width(), params.width), ButtonPlace.pixels(y, screen.height(), params.height));
  }

  private void moveTo(int x, int y) {
    params.x = x;
    params.y = y;
    if (attached) {
      windows.updateViewLayout(button, params);
    }
  }

  /** One motion event on the button: ButtonGesture decides; the view's own click handling never runs. */
  private boolean touch(View view, MotionEvent event) {
    float x = event.getRawX();
    float y = event.getRawY();
    long ms = event.getEventTime();
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        gesture.down(x, y, ms);
        startX = params.x;
        startY = params.y;
        main.postDelayed(longPress, ViewConfiguration.getLongPressTimeout());
        return true;
      case MotionEvent.ACTION_MOVE:
        if (gesture.move(x, y, ms)) {
          main.removeCallbacks(longPress);
          follow(x, y);
        }
        return true;
      case MotionEvent.ACTION_UP:
        main.removeCallbacks(longPress);
        ButtonGesture.Result result = gesture.up(ms);
        if (result == ButtonGesture.Result.TAP) {
          view.performClick();
        } else if (result == ButtonGesture.Result.LONG_PRESS) {
          view.performLongClick();
        } else if (result == ButtonGesture.Result.DRAG) {
          follow(x, y); // the up event can sit past the last move's point
          Rect screen = windows.getCurrentWindowMetrics().getBounds();
          new Prefs(this).setPlace(ButtonPlace.fraction(params.x, screen.width(), params.width),
              ButtonPlace.fraction(params.y, screen.height(), params.height));
          Log.i(Switcher.TAG, "surface=overlay moved x=" + params.x + " y=" + params.y);
        }
        return true;
      case MotionEvent.ACTION_CANCEL:
        main.removeCallbacks(longPress);
        gesture.cancel();
        return true;
      default:
        return true;
    }
  }

  /** Moves the window by the touch's offset from where it began, kept on screen. */
  private void follow(float x, float y) {
    Rect screen = windows.getCurrentWindowMetrics().getBounds();
    moveTo(ButtonPlace.clamp(startX + Math.round(gesture.dx(x)), screen.width(), params.width),
        ButtonPlace.clamp(startY + Math.round(gesture.dy(y)), screen.height(), params.height));
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
      main.removeCallbacks(longPress);
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
