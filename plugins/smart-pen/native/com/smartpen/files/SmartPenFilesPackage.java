package com.smartpen.files;

import com.inktools.files.Ink2PicFilesPackage;

/**
 * Listed in Smart Pen's PluginConfig.json `reactPackages` by scripts/native-build.cjs:
 * picture-search's file and image modules under Smart Pen's own names, so it and the other plugins
 * installed side by side never register one module name twice (#142). Smart Pen reads and writes
 * its settings file with it (#305). PluginHost calls the no-argument constructor.
 */
public class SmartPenFilesPackage extends Ink2PicFilesPackage {
  public SmartPenFilesPackage() {
    super("SmartPenFiles", "SmartPenImage");
  }
}
