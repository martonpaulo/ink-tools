package com.smartpen.files;

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
 * Listed in Smart Pen's PluginConfig.json `reactPackages` by scripts/native-build.cjs:
 * picture-search's file and image modules under Smart Pen's own names, so it and the other plugins
 * installed side by side never register one module name twice (#142). Smart Pen reads and writes
 * its settings file with it (#305), and reads the pen replay's request file (#298). PluginHost calls
 * the no-argument constructor.
 */
public class SmartPenFilesPackage extends Ink2PicFilesPackage {
  /** PluginConfig.json `pluginID`, the name of the plugin's private folder; a test pins the two. */
  static final String PLUGIN_ID = "c4f1drtuzuh0f50a";
  /** src/actions.ts `ACTION_HOME`: Smart Pen's own folder in the hidden .data/plugin/ (#298). */
  static final String ACTION_HOME = Registry.PluginhostFileSandbox.SHARED_ROOT + "/"
      + Registry.PluginhostFileSandbox.HIDDEN_FOLDER + "/inktools-smart-pen";
  /** The native timer's module name; index.js passes the same name to `nativeTimers`. */
  static final String TICKS_MODULE = "SmartPenTicks";
  /** The Back key module's name; App.tsx `BACK_MODULE` names the same (#300). */
  static final String BACK_MODULE = "SmartPenBack";

  public SmartPenFilesPackage() {
    // Its private folder, EXPORT, MyStyle/SmartPen (the profile's folder, src/profile.ts, #302) and
    // its folder in the hidden .data/plugin/, which inkctl writes and Supernote Cloud does not sync,
    // and the Ink Tools shared folder, where Gestures write the tool request (#270, #499).
    super("SmartPenFiles", "SmartPenImage", SafePaths.Roots.plugin(PLUGIN_ID, "SmartPen", ACTION_HOME,
        Registry.StorageSharedFolder.FOLDER));
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    List<NativeModule> modules = new ArrayList<>(super.createNativeModules(context));
    // The pen replay's action channel ticks with no view open, where a JS timer stops (#283, #298).
    modules.add(new TickModule(context, TICKS_MODULE));
    // sn-adapter's Back key: Back closes the view, never the note behind it (#300).
    modules.add(new BackKeyModule(context, BACK_MODULE));
    return modules;
  }
}
