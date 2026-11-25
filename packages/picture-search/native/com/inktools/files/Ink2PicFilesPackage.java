package com.inktools.files;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Listed in PluginConfig.json `reactPackages`: PluginHost finds native modules only there. The
 * no-argument constructor, the one PluginHost calls, registers Ink2Pic's module names; another
 * plugin subclasses it with its own two names, so two plugins in one host never register one name
 * twice (#142).
 */
public class Ink2PicFilesPackage implements ReactPackage {
  private final String filesModule;
  private final String imageModule;

  public Ink2PicFilesPackage() {
    this("Ink2PicFiles", "Ink2PicImage");
  }

  protected Ink2PicFilesPackage(String filesModule, String imageModule) {
    this.filesModule = filesModule;
    this.imageModule = imageModule;
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Arrays.<NativeModule>asList(
        new Ink2PicFilesModule(context, filesModule), new Ink2PicImageModule(context, imageModule));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
