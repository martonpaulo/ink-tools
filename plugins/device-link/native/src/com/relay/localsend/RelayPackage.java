package com.relay.localsend;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.inktools.backkey.BackKeyModule;
import com.inktools.timer.TickModule;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Listed in PluginConfig.json `reactPackages` by native-build.cjs: PluginHost finds modules only
 * there. Beside LocalSend, sn-adapter's timer as {@code DeviceLinkTicks}: the editor helper's action
 * channel ticks on it with no view open, where a JS timer stops (#283, #312), and sn-adapter's Back
 * key as {@code DeviceLinkBack}, so Back closes only the view, never the note behind it (#300).
 */
public final class RelayPackage implements ReactPackage {
  /** The native timer's module name; index.js passes the same name to `nativeTimers`. */
  static final String TICKS_MODULE = "DeviceLinkTicks";
  /** The Back key module's name; src/native.ts `BACK_MODULE` names the same. */
  static final String BACK_MODULE = "DeviceLinkBack";

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Arrays.<NativeModule>asList(new RelayModule(context), new TickModule(context, TICKS_MODULE),
        new BackKeyModule(context, BACK_MODULE));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
