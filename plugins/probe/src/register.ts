import {PluginManager} from 'sn-plugin-lib';

/**
 * Probe is settings-only like Bridge (docs/architecture.md): it registers the plugin's Settings entry and
 * its listener, and no note button, so it never shows inside a note.
 */
export async function registerSettingsOnly(onSettingsClick: () => void) {
  await PluginManager.init();
  const registered = await PluginManager.registerConfigButton();
  if (registered !== true) {
    throw new Error(`registerConfigButton answered ${String(registered)}`);
  }
  PluginManager.registerConfigButtonListener({onClick: onSettingsClick});
}
