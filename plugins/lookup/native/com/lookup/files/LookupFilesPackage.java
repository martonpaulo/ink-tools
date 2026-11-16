package com.lookup.files;

import com.ink2pic.files.Ink2PicFilesPackage;

/**
 * Listed in Lookup's PluginConfig.json `reactPackages` by scripts/native-build.cjs: picture-search's
 * file and image modules under Lookup's own names, so Lookup and Ink2Pic installed side by side
 * never register one module name twice (#142). PluginHost calls the no-argument constructor.
 */
public class LookupFilesPackage extends Ink2PicFilesPackage {
  public LookupFilesPackage() {
    super("LookupFiles", "LookupImage");
  }
}
