package com.supernotetools.lingo;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

/**
 * Tells where the owner writes, from window events only, with no timer (#195): the handwriting
 * keyboard is open while a `TYPE_INPUT_METHOD` window is in `getWindows()`, and the foreground
 * activity comes from `TYPE_WINDOW_STATE_CHANGED`. Enabled once over ADB (Copy.WATCHER_COMMANDS).
 * The keyboard window appears about 140 ms after its state event, so `TYPE_WINDOWS_CHANGED`
 * reads the list again (docs/supernote.md › Handwriting recognition language). An `inkctl
 * snapshot` restarts the service, so it reads the windows again on each connect.
 */
public final class WritingWatcher extends AccessibilityService {
  private static volatile boolean watching;
  private static volatile boolean keyboard;
  private static volatile boolean pluginView;
  private static volatile String foreground;

  static boolean watching() {
    return watching;
  }

  static boolean keyboardOpen() {
    return keyboard;
  }

  /** Whether a plugin view, PluginHost's overlay window, is on screen (#415). */
  static boolean pluginViewOpen() {
    return pluginView;
  }

  static String foreground() {
    return foreground;
  }

  @Override
  protected void onServiceConnected() {
    super.onServiceConnected();
    watching = true;
    readWindows();
    if (new Prefs(this).button() != ButtonRule.Mode.HIDDEN) {
      OverlayService.start(this);
    }
    OverlayService.refresh();
  }

  @Override
  public void onAccessibilityEvent(AccessibilityEvent event) {
    if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
      CharSequence name = event.getClassName();
      // shortcut: a popup or dialog also sends this event; only a class named *Activity moves the
      // foreground. Ask the PackageManager instead if a screen's activity is named otherwise.
      if (name != null && name.toString().endsWith("Activity")) {
        foreground = name.toString();
      }
    }
    readWindows();
    OverlayService.refresh();
  }

  private void readWindows() {
    boolean open = false;
    boolean plugin = false;
    for (AccessibilityWindowInfo window : getWindows()) {
      if (window.getType() == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
        open = true;
      } else if (!plugin) {
        plugin = isPluginView(window);
      }
    }
    keyboard = open;
    pluginView = plugin;
  }

  /** Whether `window` belongs to PluginHost: its root node names the package (#415). */
  private static boolean isPluginView(AccessibilityWindowInfo window) {
    AccessibilityNodeInfo root = window.getRoot();
    if (root == null) {
      return false;
    }
    boolean plugin = ButtonRule.isPluginView(root.getPackageName());
    root.recycle();
    return plugin;
  }

  @Override
  public void onInterrupt() {
    // No feedback to stop: the service only reads windows.
  }

  @Override
  public void onDestroy() {
    watching = false;
    OverlayService.refresh();
    super.onDestroy();
  }
}
