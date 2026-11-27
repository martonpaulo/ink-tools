package com.puzzles.view;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.inktools.backkey.BackKeyModule;
import java.util.Collections;
import java.util.List;

/**
 * Listed in PluginConfig.json `reactPackages` by scripts/native-build.cjs: PluginHost finds modules
 * only there. sn-adapter's Back key as {@code PuzzlesBack}, so Back closes only the Puzzles view,
 * never the note behind it (#300, #453).
 */
public final class PuzzlesPackage implements ReactPackage {
  /** The Back key module's name; src/PuzzlesView.tsx `BACK_MODULE` names the same. */
  static final String BACK_MODULE = "PuzzlesBack";

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Collections.<NativeModule>singletonList(new BackKeyModule(context, BACK_MODULE));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
