package com.inktools.timer;

import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.util.HashMap;
import java.util.Map;

/**
 * A repeating timer on the main looper for a plugin's JavaScript (#283, #370). A JS `setInterval`
 * does not fire while PluginHost shows none of the plugin's views, while a native event does: the
 * provider observer's event ran a sync with no view open (observed device behaviour, device round 5,
 * docs/supernote.md). So the action channel and the automatic sync tick on this timer instead;
 * `src/official/timers.ts` turns it back into `setInterval` and `clearInterval`.
 *
 * <p>Each plugin registers it under its own name ({@code BridgeTicks}, {@code ProbeTicks}), since the
 * plugins share one host process and never register one module name twice (#142). Each tick emits
 * {@code <name>Tick} with the key JavaScript chose.
 *
 * <p>shortcut: a Handler counts uptime, which stops while the tablet sleeps, so a tick waits for the
 * tablet to wake; an AlarmManager alarm would wake it, when a sync during sleep is wanted.
 */
public final class TickModule extends ReactContextBaseJavaModule {
  private final String name;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Map<Integer, Runnable> ticks = new HashMap<>();

  public TickModule(ReactApplicationContext context, String name) {
    super(context);
    this.name = name;
  }

  @Override
  public String getName() {
    return name;
  }

  /** Emits {@code <name>Tick} with {@code key} every {@code periodMs}; a second start of a key replaces it. */
  @ReactMethod
  public void start(double key, double periodMs) {
    int id = (int) key;
    long period = Math.max(1L, (long) periodMs);
    handler.post(
        () -> {
          stopTick(id);
          Runnable tick =
              new Runnable() {
                @Override
                public void run() {
                  if (ticks.get(id) != this) {
                    return;
                  }
                  getReactApplicationContext()
                      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                      .emit(name + "Tick", id);
                  handler.postDelayed(this, period);
                }
              };
          ticks.put(id, tick);
          handler.postDelayed(tick, period);
        });
  }

  @ReactMethod
  public void stop(double key) {
    int id = (int) key;
    handler.post(() -> stopTick(id));
  }

  private void stopTick(int id) {
    Runnable tick = ticks.remove(id);
    if (tick != null) {
      handler.removeCallbacks(tick);
    }
  }

  /** NativeEventEmitter's bookkeeping calls; the module emits whether or not they ran. */
  @ReactMethod
  public void addListener(String eventName) {}

  @ReactMethod
  public void removeListeners(double count) {}

  @Override
  public void invalidate() {
    handler.removeCallbacksAndMessages(null);
    super.invalidate();
  }
}
