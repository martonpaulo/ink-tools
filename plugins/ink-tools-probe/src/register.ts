import {PluginManager} from 'sn-plugin-lib';

/** sn-plugin-lib 0.2.3: a sidebar button in the note, with no view (as Relay's «Send Page»). */
const SIDEBAR = 1;
/** sn-plugin-lib 0.2.3: a lasso toolbar button, listed in the lasso «⋯» menu. */
const LASSO = 2;
const NO_VIEW = 0;
/** Every lasso data type (strokes, title, picture, text, link, geometric shape), so the row is live for any lasso. */
const ANY_LASSO_DATA = [0, 1, 2, 3, 4, 5];
/** The «Run Command» button inkctl presses (#148); the CLI finds it by this name. */
export const COMMAND_BUTTON = {id: 300, name: 'Run Command'};
/**
 * The same command from the lasso menu (#249): a sidebar press clears the lasso, so a call that
 * needs one made by hand, such as `saveStickerByLasso`, runs from here (`inkctl lasso press`).
 */
export const LASSO_COMMAND_BUTTON = {id: 301, name: 'Run Command'};

/**
 * Probe registers its Settings entry, which opens the probe view, and «Run Command», which runs
 * inkctl's command file, twice: in the note sidebar (#148) and in the lasso menu (#249).
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
  const lasso = await PluginManager.registerButton(LASSO, ['NOTE'], {
    ...LASSO_COMMAND_BUTTON,
    icon,
    editDataTypes: ANY_LASSO_DATA,
    showType: NO_VIEW,
  });
  if (lasso !== true) {
    throw new Error(`registerButton(lasso ${LASSO_COMMAND_BUTTON.name}) answered ${String(lasso)}`);
  }
  PluginManager.registerButtonListener({
    onButtonPress(event: {id: number}) {
      if (event.id === COMMAND_BUTTON.id || event.id === LASSO_COMMAND_BUTTON.id) {
        onCommand();
      }
    },
  });
}
