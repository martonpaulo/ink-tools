package com.probe.providers;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;

/** Listed in PluginConfig.json `reactPackages` by native-build.cjs: PluginHost finds modules only there. */
public final class ProbePackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Collections.<NativeModule>singletonList(new ProbeProvidersModule(context));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
