package com.inktools.files;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * The file and image modules a plugin's package lists in PluginConfig.json `reactPackages`, where
 * PluginHost finds native modules. Each plugin subclasses it with a no-argument constructor, the one
 * PluginHost calls, giving its own two module names, so two plugins in one host never register one
 * name twice (#142), and its own folders, the only ones the modules touch (#302).
 */
public abstract class Ink2PicFilesPackage implements ReactPackage {
  private final String filesModule;
  private final String imageModule;
  private final SafePaths.Roots roots;

  protected Ink2PicFilesPackage(String filesModule, String imageModule, SafePaths.Roots roots) {
    this.filesModule = filesModule;
    this.imageModule = imageModule;
    this.roots = roots;
  }

  /** The plugin's folders, for a module of its own that reads or writes files. */
  protected SafePaths.Roots roots() {
    return roots;
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Arrays.<NativeModule>asList(
        new Ink2PicFilesModule(context, filesModule, roots),
        new Ink2PicImageModule(context, imageModule, roots));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
