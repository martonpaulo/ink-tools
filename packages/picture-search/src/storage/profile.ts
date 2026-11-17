/**
 * What makes the device tier one plugin's (#142): its folder in shared storage, the names its own
 * native modules register (`Ink2PicFilesPackage`'s constructor) and its HTTP User-Agent. Each
 * plugin sets its profile once, in the module its code imports this tier through
 * (`plugins/ink2pic/src/profile.ts`), so two plugins in one host never share a folder or a module.
 */

export type PluginProfile = {
  /** The name the console log tags each line with, such as `Ink2Pic`. */
  name: string;
  /** The plugin's folder under the shared root, such as `MyStyle/Ink2Pic`. */
  folder: string;
  /** The React module name of the native file module, such as `Ink2PicFiles`. */
  filesModule: string;
  /** The React module name of the native image module, such as `Ink2PicImage`. */
  imageModule: string;
  /** The User-Agent of every download. */
  userAgent: string;
  /**
   * The build, the plugin's PluginConfig.json versionCode: the search cache keeps only this
   * build's answers, so an update searches again (#210).
   */
  build: string;
};

let current: PluginProfile | null = null;

/** Sets the plugin's profile; the plugin's entry into this tier calls it before any other call. */
export function setPluginProfile(profile: PluginProfile): void {
  current = profile;
}

/** The plugin's profile; throws when none was set, so no call reaches another plugin's files. */
export function pluginProfile(): PluginProfile {
  if (!current) {
    throw new Error(
      "picture-search/storage: no plugin profile; import the device tier through the plugin profile module"
    );
  }
  return current;
}

/** The profile's name, or null before one is set: the log works before the profile does. */
export function profileName(): string | null {
  return current ? current.name : null;
}
