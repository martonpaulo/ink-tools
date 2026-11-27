import {PluginManager} from 'sn-plugin-lib';
import {
  BUTTON_TYPE_LASSO,
  BUTTON_TYPE_SIDEBAR,
  EDIT_DATA_ANY,
  SHOW_NO_VIEW,
} from '@ink-tools/sn-adapter/buttons';
import {REGISTRY} from '@ink-tools/sn-adapter/registry';

/** The «Run Command» button inkctl presses (#148); the CLI finds it by this name, from registry item storage.helper-channel. */
export const COMMAND_BUTTON = {id: 300, name: REGISTRY.storageHelperChannel.commandButton};
/**
 * The same command from the lasso menu (#249): a sidebar press clears the lasso, so a call that
 * needs one made by hand, such as `saveStickerByLasso`, runs from here (`inkctl lasso press`).
 */
export const LASSO_COMMAND_BUTTON = {id: 301, name: REGISTRY.storageHelperChannel.commandButton};

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
  const button = await PluginManager.registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
    ...COMMAND_BUTTON,
    icon,
    showType: SHOW_NO_VIEW,
  });
  if (button !== true) {
    throw new Error(`registerButton(${COMMAND_BUTTON.name}) answered ${String(button)}`);
  }
  const lasso = await PluginManager.registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
    ...LASSO_COMMAND_BUTTON,
    icon,
    editDataTypes: [...EDIT_DATA_ANY],
    showType: SHOW_NO_VIEW,
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
