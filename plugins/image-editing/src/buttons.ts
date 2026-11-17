/**
 * Image Editing's one lasso button (#226): «Image Editing», shown when the lasso holds a picture,
 * with `showType` 1, so the host opens the plugin's full view, the editor, where every edit is a
 * button. The builds before it registered one row per edit, which crowded the lasso menu.
 */
import {
  registerButton,
  Result,
  unregisterButton,
} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
import {EDITOR_BUTTON_ID, LEGACY_BUTTON_IDS} from './edits';

/** sn-plugin-lib's lasso toolbar button (as Lookup's src/buttons.ts). */
export const BUTTON_TYPE_LASSO = 2;
/** `editDataTypes` 2: the lasso holds a picture (sn-plugin-lib 0.2.3, NativePluginManager). */
export const EDIT_DATA_PICTURE = 2;
/** `showType` 1: the press opens the plugin's full view (PluginButton). */
export const SHOW_FULL_VIEW = 1;

export type ButtonDeps = {
  register: typeof registerButton;
  unregister: typeof unregisterButton;
  log: (line: string) => void;
};

const DEVICE: ButtonDeps = {
  register: registerButton,
  unregister: unregisterButton,
  log: line => console.log(`Retouch: ${line}`),
};

const describe = (what: string, result: Result<unknown>): string =>
  result.ok
    ? `${what}: ok`
    : `${what} failed: ${result.code} ${result.message}`;

/**
 * Removes the per-edit rows of earlier builds, then registers the one «Image Editing» button. A
 * failed removal is expected for an id the host does not hold, so only the count is logged.
 */
export async function registerEditorButton(
  deps: ButtonDeps = DEVICE,
): Promise<Result<true>> {
  let removed = 0;
  for (const id of LEGACY_BUTTON_IDS) {
    const result = await deps.unregister(id);
    removed += result.ok ? 1 : 0;
  }
  if (removed > 0) {
    deps.log(`removed ${removed} lasso rows of an earlier build`);
  }
  const result = await deps.register(BUTTON_TYPE_LASSO, ['NOTE'], {
    id: EDITOR_BUTTON_ID,
    name: copy.title,
    editDataTypes: [EDIT_DATA_PICTURE],
    showType: SHOW_FULL_VIEW,
  });
  deps.log(describe(`register ${copy.title}`, result));
  return result;
}
