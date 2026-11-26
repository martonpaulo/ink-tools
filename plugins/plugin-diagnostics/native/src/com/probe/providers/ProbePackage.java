package com.probe.providers;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.inktools.timer.TickModule;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Listed in PluginConfig.json `reactPackages` by native-build.cjs: PluginHost finds modules only there. */
public final class ProbePackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    // ProbeTicks: the action channel's timer, which ticks with no view open (#283); index.js names it.
    return Arrays.<NativeModule>asList(
        new ProbeProvidersModule(context), new TickModule(context, "ProbeTicks"));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
