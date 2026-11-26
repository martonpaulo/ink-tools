package com.lookup.files;

import com.inktools.files.Ink2PicFilesPackage;
import com.inktools.files.SafePaths;

/**
 * Listed in Lookup's PluginConfig.json `reactPackages` by scripts/native-build.cjs: picture-search's
 * file and image modules under Lookup's own names, so Lookup and Ink2Pic installed side by side
 * never register one module name twice (#142). PluginHost calls the no-argument constructor.
 */
public class LookupFilesPackage extends Ink2PicFilesPackage {
  /** PluginConfig.json `pluginID`, the name of the plugin's private folder; a test pins the two. */
  static final String PLUGIN_ID = "t2obvupqt3edmnrr";

  public LookupFilesPackage() {
    // Its private folder, EXPORT and MyStyle/Lookup, the profile's folder (src/profile.ts, #302).
    super("LookupFiles", "LookupImage", SafePaths.Roots.plugin(PLUGIN_ID, "Lookup"));
  }
}
