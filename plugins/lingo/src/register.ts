import {PluginManager} from 'sn-plugin-lib';

/**
 * Lingo registers its Settings entry and listener only, for now. The lasso button comes with the
 * translate flow (#46), so the device never shows a button that does nothing.
 */
export async function registerSettingsEntry(onSettingsClick: () => void) {
  await PluginManager.init();
  const registered = await PluginManager.registerConfigButton();
  if (registered !== true) {
    throw new Error(`registerConfigButton answered ${String(registered)}`);
  }
  PluginManager.registerConfigButtonListener({onClick: onSettingsClick});
}
