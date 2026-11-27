/**
 * Image Editing's one lasso button (#226): «Image Editing», with `showType` 1, so the host opens the
 * plugin's full view, the editor, where every edit is a button. The builds before it registered one
 * row per edit, which crowded the lasso menu.
 *
 * The row takes every lasso data type: a row registered for pictures alone stayed grey for a lasso
 * of a picture with ink over it (measured on the Manta, 2026-11-27, #522), so the editor's picture
 * with ink or shapes in its lasso could not be reached. The editor itself says when the lasso holds
 * no picture.
 */
import {Image} from 'react-native';
import {
  BUTTON_TYPE_LASSO,
  BUTTON_TYPE_SIDEBAR,
  EDIT_DATA_ANY,
  registerButton,
  Result,
  SHOW_FULL_VIEW,
  unregisterButton,
} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
import {EDITOR_BUTTON_ID, EDITOR_TOOLBAR_ID, LEGACY_BUTTON_IDS} from './edits';

// sn-plugin-lib's button values, owned by sn-adapter (#295).
export {BUTTON_TYPE_LASSO, BUTTON_TYPE_SIDEBAR, EDIT_DATA_ANY, SHOW_FULL_VIEW};

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
    editDataTypes: [...EDIT_DATA_ANY],
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
