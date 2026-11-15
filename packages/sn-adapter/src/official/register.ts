import {PluginManager} from 'sn-plugin-lib';

/**
 * Registers the plugin's Settings entry and its listener only, and no note button, for a plugin
 * that never shows inside a note (Bridge) or has no note action yet (Lingo).
 */
export async function registerSettingsEntry(onSettingsClick: () => void): Promise<void> {
  await PluginManager.init();
  const registered = await PluginManager.registerConfigButton();
  if (registered !== true) {
    throw new Error(`registerConfigButton answered ${String(registered)}`);
  }
  PluginManager.registerConfigButtonListener({onClick: onSettingsClick});
}
