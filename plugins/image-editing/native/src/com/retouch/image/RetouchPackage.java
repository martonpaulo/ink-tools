package com.retouch.image;

import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.inktools.files.Ink2PicFilesPackage;
import java.util.ArrayList;
import java.util.List;

/**
 * Listed in PluginConfig.json `reactPackages` by native-build.cjs: PluginHost finds modules only
 * there. It reuses Ink2Pic's file and image modules under Retouch's own names, so two plugins in
 * one host never register one name twice (#142), and adds {@link RetouchModule} (#136).
 */
public final class RetouchPackage extends Ink2PicFilesPackage {
  public RetouchPackage() {
    super("RetouchFiles", "RetouchInk2PicImage");
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    List<NativeModule> modules = new ArrayList<>(super.createNativeModules(context));
    modules.add(new RetouchModule(context));
    return modules;
  }
}
