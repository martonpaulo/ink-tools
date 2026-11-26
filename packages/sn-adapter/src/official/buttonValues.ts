/**
 * sn-plugin-lib 0.2.3's button values, owned here so no plugin writes its own copy (#295):
 * `registerButton`'s first argument, its config's `showType`, and the lasso data a lasso button
 * takes (`editDataTypes`, NativePluginManager).
 */
/** The note toolbar's «Plugins» menu button, which the owner can pin. */
export const BUTTON_TYPE_SIDEBAR = 1;
/** A lasso toolbar button, listed in the lasso «⋯» menu. */
export const BUTTON_TYPE_LASSO = 2;
/** `showType` 0: the press runs with no view. */
export const SHOW_NO_VIEW = 0;
/** `showType` 1: the press opens the plugin's full view. */
export const SHOW_FULL_VIEW = 1;
/** `editDataTypes` 0: the lasso holds strokes. */
export const EDIT_DATA_STROKES = 0;
/** `editDataTypes` 2: the lasso holds a picture. */
export const EDIT_DATA_PICTURE = 2;
/** Every lasso data type (strokes, title, picture, text, link, geometric shape): a row live for any lasso. */
export const EDIT_DATA_ANY: readonly number[] = [0, 1, 2, 3, 4, 5];
