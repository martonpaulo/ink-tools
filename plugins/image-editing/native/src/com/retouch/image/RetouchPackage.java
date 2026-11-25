package com.retouch.image;

import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.inktools.files.Ink2PicFilesPackage;
import com.inktools.files.SafePaths;
import java.util.ArrayList;
import java.util.List;

/**
 * Listed in PluginConfig.json `reactPackages` by native-build.cjs: PluginHost finds modules only
 * there. It reuses Ink2Pic's file and image modules under Retouch's own names, so two plugins in
 * one host never register one name twice (#142), and adds {@link RetouchModule} (#136).
 */
public final class RetouchPackage extends Ink2PicFilesPackage {
  /** PluginConfig.json `pluginID`, the name of the plugin's private folder; a test pins the two. */
  static final String PLUGIN_ID = "l5m9ev3xmshh37u8";

  public RetouchPackage() {
    // Its private folder, EXPORT and MyStyle/Retouch, where the debug PNGs go (src/debug.ts, #302).
    super(
        "RetouchFiles",
        "RetouchInk2PicImage",
        SafePaths.Roots.plugin(PLUGIN_ID, "Retouch"));
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    List<NativeModule> modules = new ArrayList<>(super.createNativeModules(context));
    modules.add(new RetouchModule(context, roots()));
    return modules;
  }
}
