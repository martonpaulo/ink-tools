import {PluginManager} from 'sn-plugin-lib';

/** sn-plugin-lib 0.2.3: a sidebar button in the note, with no view (as Relay's «Send Page»). */
const SIDEBAR = 1;
const NO_VIEW = 0;
/** The «Run Command» button inkctl presses (#148); the CLI finds it by this name. */
export const COMMAND_BUTTON = {id: 300, name: 'Run Command'};

/**
 * Probe registers its Settings entry, which opens the probe view, and one note sidebar button,
 * «Run Command», that runs inkctl's command file (#148). It has no lasso button.
 */
export async function registerProbe(onSettingsClick: () => void, onCommand: () => void, icon: string) {
  await PluginManager.init();
  const registered = await PluginManager.registerConfigButton();
  if (registered !== true) {
    throw new Error(`registerConfigButton answered ${String(registered)}`);
  }
  PluginManager.registerConfigButtonListener({onClick: onSettingsClick});
  const button = await PluginManager.registerButton(SIDEBAR, ['NOTE'], {
    ...COMMAND_BUTTON,
    icon,
    showType: NO_VIEW,
  });
  if (button !== true) {
    throw new Error(`registerButton(${COMMAND_BUTTON.name}) answered ${String(button)}`);
  }
  PluginManager.registerButtonListener({
    onButtonPress(event: {id: number}) {
      if (event.id === COMMAND_BUTTON.id) {
        onCommand();
      }
    },
  });
}
