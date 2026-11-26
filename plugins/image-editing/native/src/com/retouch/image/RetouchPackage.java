package com.retouch.image;

import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.inktools.backkey.BackKeyModule;
import com.inktools.files.Ink2PicFilesPackage;
import com.inktools.files.Registry;
import com.inktools.files.SafePaths;
import java.util.ArrayList;
import java.util.List;

/**
 * Listed in PluginConfig.json `reactPackages` by native-build.cjs: PluginHost finds modules only
 * there. It reuses Ink2Pic's file and image modules under Retouch's own names, so two plugins in
 * one host never register one name twice (#142), and adds {@link RetouchModule} (#136) and
 * sn-adapter's Back key as {@code ImageEditingBack} (#226, #300).
 */
public final class RetouchPackage extends Ink2PicFilesPackage {
  /** The Back key module's name; src/native.ts `BACK_MODULE` names the same. */
  static final String BACK_MODULE = "ImageEditingBack";

  /** PluginConfig.json `pluginID`, the name of the plugin's private folder; a test pins the two. */
  static final String PLUGIN_ID = "l5m9ev3xmshh37u8";
  /** src/debug.ts `DEBUG_HOME`: Image Editing's own folder in the hidden .data/plugin/ (#367). */
  static final String DEBUG_HOME = Registry.PluginhostFileSandbox.SHARED_ROOT + "/"
      + Registry.PluginhostFileSandbox.HIDDEN_FOLDER + "/inktools-image-editing";

  public RetouchPackage() {
    // Its private folder, EXPORT, MyStyle/Retouch and its folder in the hidden .data/plugin/,
    // where the debug PNGs go, out of the cloud sync (src/debug.ts, #367).
    super(
        "RetouchFiles",
        "RetouchInk2PicImage",
        SafePaths.Roots.plugin(PLUGIN_ID, "Retouch", DEBUG_HOME));
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    List<NativeModule> modules = new ArrayList<>(super.createNativeModules(context));
    modules.add(new RetouchModule(context, roots()));
    modules.add(new BackKeyModule(context, BACK_MODULE));
    return modules;
  }
}
