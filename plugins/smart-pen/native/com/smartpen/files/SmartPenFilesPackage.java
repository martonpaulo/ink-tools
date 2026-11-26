package com.smartpen.files;

import com.inktools.files.Ink2PicFilesPackage;
import com.inktools.files.SafePaths;

/**
 * Listed in Smart Pen's PluginConfig.json `reactPackages` by scripts/native-build.cjs:
 * picture-search's file and image modules under Smart Pen's own names, so it and the other plugins
 * installed side by side never register one module name twice (#142). Smart Pen reads and writes
 * its settings file with it (#305). PluginHost calls the no-argument constructor.
 */
public class SmartPenFilesPackage extends Ink2PicFilesPackage {
  /** PluginConfig.json `pluginID`, the name of the plugin's private folder; a test pins the two. */
  static final String PLUGIN_ID = "c4f1drtuzuh0f50a";

  public SmartPenFilesPackage() {
    // Its private folder, EXPORT and MyStyle/SmartPen, the profile's folder (src/profile.ts, #302).
    super("SmartPenFiles", "SmartPenImage", SafePaths.Roots.plugin(PLUGIN_ID, "SmartPen"));
  }
}
