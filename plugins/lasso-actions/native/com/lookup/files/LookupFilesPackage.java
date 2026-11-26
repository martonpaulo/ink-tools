package com.lookup.files;

import com.inktools.files.Ink2PicFilesPackage;
import com.inktools.files.Registry;
import com.inktools.files.SafePaths;

/**
 * Listed in Lookup's PluginConfig.json `reactPackages` by scripts/native-build.cjs: picture-search's
 * file and image modules under Lookup's own names, so Lookup and the retired picture plugin installed side by side
 * never register one module name twice (#142). PluginHost calls the no-argument constructor.
 */
public class LookupFilesPackage extends Ink2PicFilesPackage {
  /** PluginConfig.json `pluginID`, the name of the plugin's private folder; a test pins the two. */
  static final String PLUGIN_ID = "t2obvupqt3edmnrr";

  /**
   * The retired picture plugin's folders Lookup replaces (#91), which Settings counts so the person can delete them
   * (`OLD_FOLDERS` in src/library.ts): folders of its own, so the allowlist names them (#302).
   */
  static final String RETIRED =
      Registry.PluginhostFileSandbox.SHARED_ROOT + "/" + Registry.PluginhostFileSandbox.SHARED_FOLDER + "/Ink2Pic/";

  public LookupFilesPackage() {
    // Its private folder, EXPORT and MyStyle/Lookup, the profile's folder (src/profile.ts, #302),
    // and the retired picture plugin's folders it replaces.
    super("LookupFiles", "LookupImage", SafePaths.Roots.plugin(PLUGIN_ID, "Lookup", RETIRED + "library", RETIRED + "symbols"));
  }
}
