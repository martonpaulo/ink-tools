package com.bridge.files;

import com.bridge.providers.BridgeProvidersModule;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.ink2pic.files.Ink2PicFilesPackage;
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
  public BridgeFilesPackage() {
    super("BridgeFiles", "BridgeImage");
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    List<NativeModule> modules = new ArrayList<>(super.createNativeModules(context));
    modules.add(new BridgeProvidersModule(context));
    return modules;
  }
}
