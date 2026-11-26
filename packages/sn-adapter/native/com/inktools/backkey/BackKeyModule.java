package com.inktools.backkey;

import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UIManager;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.uimanager.UIManagerHelper;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;

/**
 * The device Back key for a plugin's full view (#226, #300), one copy for every plugin. PluginHost
 * shows the plugin's React root view in a focusable overlay window, never in an Activity, so React
 * Native's `hardwareBackPress` never fires (`docs/supernote.md` › Plugins, #204), and an unhandled
 * Back went on to the note behind the view: on Device Link 0.2.0 beta 1 it closed the view and the
 * note with it (measured, Manta, device round 9, 2026-11-26). A window hands a key only to its
 * focused view: this makes the root view focusable, keeps it focused each time PluginHost adds it
 * again, takes both halves of Back, and turns the key into the `hardwareBackPress` event that
 * ui-kit's `useBackKey` listens to, so the JavaScript side keeps one route for Back and the view
 * does what its own «Close» does.
 *
 * <p>Each plugin registers it under its own name ({@code DeviceLinkBack}, {@code ImageEditingBack}),
 * since the plugins share one host process and never register one module name twice (#142), as
 * {@code TickModule} is.
 *
 * <p>shortcut: inferred from PluginHost 1.00.2610150's observed behaviour (window flags 0x520, no key
 * handling of its own), registry item {@code pluginhost.overlay-back-key}, not yet measured on the
 * tablet; drop this class if a device round shows the key never reaches the focused root view.
 */
public final class BackKeyModule extends ReactContextBaseJavaModule {
  private static final String TAG = "INKTOOLS";
  /** The root views already given the listener, so each one gets one attach listener. */
  private static final Set<View> ARMED = Collections.newSetFromMap(new WeakHashMap<>());

  /** The plugin's own name for this module. */
  private final String moduleName;

  public BackKeyModule(ReactApplicationContext context, String name) {
    super(context);
    moduleName = name;
  }

  @Override
  public String getName() { return moduleName; }

  /**
   * Makes the device Back key reach the view whose React root has `rootTag`. Resolves true once
   * set; rejects NOT_FOUND when no view has that tag.
   */
  @ReactMethod
  public void listenBackKey(double rootTag, Promise promise) {
    ReactApplicationContext context = getReactApplicationContext();
    int tag = (int) rootTag;
    UiThreadUtil.runOnUiThread(() -> {
      try {
        UIManager uiManager = UIManagerHelper.getUIManagerForReactTag(context, tag);
        View root = uiManager == null ? null : uiManager.resolveView(tag);
        if (root == null) {
          promise.reject("NOT_FOUND", "no view has the root tag " + tag);
          return;
        }
        listen(root, context, moduleName);
        promise.resolve(true);
      } catch (RuntimeException error) {
        // resolveView throws for a tag it does not hold.
        promise.reject("NOT_FOUND", error.getClass().getName() + ": " + error.getMessage());
      }
    });
  }

  /** Call on the UI thread with the plugin's React root view. */
  private static void listen(View root, ReactContext context, String name) {
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
        Log.i(TAG, name + ": back key");
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
