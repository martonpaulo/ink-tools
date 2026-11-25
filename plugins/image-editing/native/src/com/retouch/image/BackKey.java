package com.retouch.image;

import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;

/**
 * The device Back key for Retouch's view (#226). PluginHost shows the plugin's React root view in
 * a focusable overlay window, never in an Activity, so React Native's `hardwareBackPress` never
 * fires (`docs/supernote.md` › Plugins, #204). The key still reaches the window, and a window
 * hands a key only to its focused view: this makes the root view focusable, keeps it focused each
 * time PluginHost adds it again, and turns Back into the `hardwareBackPress` event that
 * `useBackKey` listens to, so the JavaScript side keeps one route for Back.
 *
 * <p>shortcut: inferred from the decompiled PluginHost 1.00.2610150 (window flags 0x520, no key
 * handling of its own), not yet measured on the tablet; drop this class if a device round shows
 * the key never reaches the focused root view.
 */
final class BackKey {
  private static final String TAG = "Retouch";
  /** The root views already given the listener, so each one gets one attach listener. */
  private static final Set<View> ARMED = Collections.newSetFromMap(new WeakHashMap<>());

  private BackKey() {}

  /** Call on the UI thread with the plugin's React root view. */
  static void listen(View root, ReactContext context) {
    root.setFocusable(true);
    root.setFocusableInTouchMode(true);
    // Focus is only the key's route here: the e-ink screen shows no focus highlight.
    root.setDefaultFocusHighlightEnabled(false);
    // A focusable view is one screen-reader item that reads all its text at once; the root stays
    // out of that tree, so each control is still read by itself.
    root.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    root.setOnKeyListener((view, keyCode, event) -> {
      if (keyCode != KeyEvent.KEYCODE_BACK) {
        return false;
      }
      if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) {
        Log.i(TAG, "back key");
        DeviceEventManagerModule events = context.getNativeModule(DeviceEventManagerModule.class);
        if (events != null) {
          events.emitHardwareBackPressed();
        }
      }
      // Both halves of the key are the view's: Back never reaches the note behind it.
      return true;
    });
    if (ARMED.add(root)) {
      // Each show removes the root view and adds it again (PluginApp.showPluginView), which
      // drops its focus.
      root.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
        @Override
        public void onViewAttachedToWindow(View view) {
          view.post(view::requestFocus);
        }

        @Override
        public void onViewDetachedFromWindow(View view) {}
      });
    }
    root.requestFocus();
  }
}
