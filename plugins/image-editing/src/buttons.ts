/**
 * One lasso button per edit switched on in Settings (#136), shown when the lasso holds a picture,
 * run with no view, as Lingo's direction buttons (#128), or opening a view when its row says so
 * (Styles, #133). A button exists only while its switch is on.
 */
import {
  registerButton,
  Result,
  unregisterButton,
} from '@supernote-tools/sn-adapter/official';
import {EDITS, enabledEdits, RetouchSettings} from './edits';

/** sn-plugin-lib's lasso toolbar button (as Lookup's src/buttons.ts). */
export const BUTTON_TYPE_LASSO = 2;
/** `editDataTypes` 2: the lasso holds a picture (sn-plugin-lib 0.2.3, NativePluginManager). */
export const EDIT_DATA_PICTURE = 2;

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

/** The ids the host holds now, as this runtime registered them. */
const registered = new Set<number>();

const describe = (what: string, result: Result<unknown>): string =>
  result.ok
    ? `${what}: ok`
    : `${what} failed: ${result.code} ${result.message}`;

/**
 * Registers the buttons of the edits switched on and removes the others. A failed call is logged
 * and leaves that button's state as it was, so the next change tries again.
 */
export async function syncButtons(
  settings: RetouchSettings,
  deps: ButtonDeps = DEVICE,
): Promise<void> {
  const wanted = new Set(enabledEdits(settings).map(e => e.buttonId));
  for (const edit of EDITS) {
    const on = wanted.has(edit.buttonId);
    if (on === registered.has(edit.buttonId)) {
      continue;
    }
    const result = on
      ? await deps.register(BUTTON_TYPE_LASSO, ['NOTE'], {
          id: edit.buttonId,
          name: edit.name,
          editDataTypes: [EDIT_DATA_PICTURE],
          showType: edit.showType,
        })
      : await deps.unregister(edit.buttonId);
    deps.log(
      describe(`${on ? 'register' : 'unregister'} ${edit.name}`, result),
    );
    if (result.ok) {
      on ? registered.add(edit.buttonId) : registered.delete(edit.buttonId);
    }
  }
}

export function resetButtonsForTests(): void {
  registered.clear();
}
