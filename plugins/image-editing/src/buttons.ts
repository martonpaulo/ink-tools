/**
 * Image Editing's one lasso button (#226): «Image Editing», shown when the lasso holds a picture,
 * with `showType` 1, so the host opens the plugin's full view, the editor, where every edit is a
 * button. The builds before it registered one row per edit, which crowded the lasso menu.
 */
import {Image} from 'react-native';
import {
  registerButton,
  Result,
  unregisterButton,
} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
import {EDITOR_BUTTON_ID, EDITOR_TOOLBAR_ID, LEGACY_BUTTON_IDS} from './edits';

/** sn-plugin-lib's lasso toolbar button (as Lookup's src/buttons.ts). */
export const BUTTON_TYPE_LASSO = 2;
/** sn-plugin-lib's note toolbar button, which the owner can pin (#248). */
export const BUTTON_TYPE_SIDEBAR = 1;
/** `editDataTypes` 2: the lasso holds a picture (sn-plugin-lib 0.2.3, NativePluginManager). */
export const EDIT_DATA_PICTURE = 2;
/** `showType` 1: the press opens the plugin's full view (PluginButton). */
export const SHOW_FULL_VIEW = 1;

export type ButtonDeps = {
  register: typeof registerButton;
  unregister: typeof unregisterButton;
  log: (line: string) => void;
  /** The button's icon URI (#107), drawn from `assets/editor.svg` by `scripts/icons.py`. */
  icon: string | undefined;
};

const DEVICE: ButtonDeps = {
  register: registerButton,
  unregister: unregisterButton,
  log: line => console.log(`Retouch: ${line}`),
  icon: Image.resolveAssetSource(require('../assets/editor.png'))?.uri,
};

const describe = (what: string, result: Result<unknown>): string =>
  result.ok
    ? `${what}: ok`
    : `${what} failed: ${result.code} ${result.message}`;

/**
 * Registers the one «Image Editing» button first, then asks the host to remove the per-edit rows
 * of earlier builds without waiting for them. On this firmware an `unregisterButton` of an id the
 * plugin does not hold never answers (`docs/supernote.md` › Plugins, #226): awaiting it left the
 * lasso menu with no Image Editing row. Each removal that does answer is logged when it settles.
 */
export async function registerEditorButton(
  deps: ButtonDeps = DEVICE,
): Promise<Result<true>> {
  const result = await deps.register(BUTTON_TYPE_LASSO, ['NOTE'], {
    id: EDITOR_BUTTON_ID,
    name: copy.title,
    editDataTypes: [EDIT_DATA_PICTURE],
    showType: SHOW_FULL_VIEW,
    icon: deps.icon,
  });
  deps.log(describe(`register ${copy.title}`, result));
  // The same editor from the note toolbar, which the owner can pin; it opens with no lasso too
  // and then shows what it needs (#248). Its failure leaves the lasso row as it is.
  const toolbar = await deps.register(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
    id: EDITOR_TOOLBAR_ID,
    name: copy.title,
    showType: SHOW_FULL_VIEW,
    icon: deps.icon,
  });
  deps.log(describe(`register ${copy.title} toolbar button`, toolbar));
  for (const id of LEGACY_BUTTON_IDS) {
    deps
      .unregister(id)
      .then(removed => {
        if (removed.ok) {
          deps.log(`removed lasso row ${id} of an earlier build`);
        }
      })
      .catch(() => {});
  }
  return result;
}
