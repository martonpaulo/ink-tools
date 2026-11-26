package com.bridge.files;

import com.bridge.providers.BridgeProvidersModule;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.inktools.files.Ink2PicFilesPackage;
import com.inktools.files.Registry;
import com.inktools.files.SafePaths;
import com.inktools.backkey.BackKeyModule;
import com.inktools.timer.TickModule;
import java.util.ArrayList;
import java.util.List;

/**
 * Listed in Bridge's PluginConfig.json `reactPackages` by scripts/native-build.cjs: picture-search's
 * file and image modules under Bridge's own names, so Bridge, Lookup and Ink2Pic installed side by
 * side never register one module name twice (#142). Bridge reads and writes its Settings file with
 * it (#40), and reads the device's providers with `BridgeProviders`, sn-adapter's device reader (#43).
 * PluginHost calls the no-argument constructor.
 */
public class BridgeFilesPackage extends Ink2PicFilesPackage {
  /** PluginConfig.json `pluginID`, the name of the plugin's private folder; a test pins the two. */
  static final String PLUGIN_ID = "4d11a9bbc6ad25e2";
  /** The native timer's module name; index.js passes the same name to `nativeTimers`. */
  static final String TICKS_MODULE = "BridgeTicks";
  /** The Back key module's name; App.tsx `BACK_MODULE` names the same (#300). */
  static final String BACK_MODULE = "AccountSyncBack";

  public BridgeFilesPackage() {
    // Its private folder, EXPORT, MyStyle/Bridge and the sign-in drop folder of
    // `inkctl secret set` (registry storageSignInDropFolder, #116, #302).
    super(
        "BridgeFiles",
        "BridgeImage",
        SafePaths.Roots.plugin(PLUGIN_ID, "Bridge", Registry.StorageSignInDropFolder.FOLDER));
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    List<NativeModule> modules = new ArrayList<>(super.createNativeModules(context));
    modules.add(new BridgeProvidersModule(context));
    // The timer of the automatic sync and the action channel, which ticks with no view open (#283).
    modules.add(new TickModule(context, TICKS_MODULE));
    // sn-adapter's Back key: Back closes the view, never the note behind it (#300).
    modules.add(new BackKeyModule(context, BACK_MODULE));
    return modules;
  }
}
