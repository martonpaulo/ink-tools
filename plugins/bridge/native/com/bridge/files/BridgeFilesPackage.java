package com.bridge.files;

import com.ink2pic.files.Ink2PicFilesPackage;

/**
 * Listed in Bridge's PluginConfig.json `reactPackages` by scripts/native-build.cjs: picture-search's
 * file and image modules under Bridge's own names, so Bridge, Lookup and Ink2Pic installed side by
 * side never register one module name twice (#142). Bridge reads and writes its Settings file with
 * it (#40). PluginHost calls the no-argument constructor.
 */
public class BridgeFilesPackage extends Ink2PicFilesPackage {
  public BridgeFilesPackage() {
    super("BridgeFiles", "BridgeImage");
  }
}
