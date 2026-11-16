/**
 * Lookup's lasso buttons follow its Settings switches (#115): «Insert definition» exists only while
 * its switch is on, as Lingo's direction buttons do (#128). Turning it on also asks for each
 * permission the press needs, while the view is open to show the question.
 */
import {
  hasPermission,
  PERMISSION_FILE_READ,
  PERMISSION_INTERNET,
  registerButton,
  requestPermission,
  Result,
  unregisterButton,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';
import {DEFINE_BUTTON_ID} from './definition';

/** sn-plugin-lib's lasso toolbar button, for strokes, with no view (as Lingo's src/buttons.ts). */
export const BUTTON_TYPE_LASSO = 2;
export const EDIT_DATA_STROKES = 0;
export const SHOW_NO_VIEW = 0;

/**
 * shortcut: the switches live in memory and reset when Lookup restarts, as Lingo's and Bridge's
 * do; upgrade when the settings store moves in (#142).
 */
export type LookupSettings = {definition: boolean};

export const defaultSettings: LookupSettings = {definition: false};

export type ButtonDeps = {
  register: typeof registerButton;
  unregister: typeof unregisterButton;
  hasPermission: typeof hasPermission;
  requestPermission: typeof requestPermission;
  log: (line: string) => void;
};

const DEVICE: ButtonDeps = {
  register: registerButton,
  unregister: unregisterButton,
  hasPermission,
  requestPermission,
  log: line => console.log(`Lookup: ${line}`),
};

/** Whether the host holds the definition button now, as this runtime registered it. */
let registered = false;

const describe = (what: string, result: Result<unknown>): string =>
  result.ok
    ? `${what}: ok`
    : `${what} failed: ${result.code} ${result.message}`;

/**
 * What the definition press needs: Internet for the dictionary, and file read, without which the
 * host refuses the lasso calls with error 1503 (device round, 2026-11-16, #128).
 */
const NEEDS = [
  {permission: PERMISSION_INTERNET, reason: copy['permission.internet']},
  {permission: PERMISSION_FILE_READ, reason: copy['permission.files']},
] as const;

/**
 * The Settings path: the button follows the switch; a failed call is logged and leaves the state
 * as it was, so the next change tries again. Turning it on asks for each permission not granted.
 */
export async function settingsChanged(
  settings: LookupSettings,
  deps: ButtonDeps = DEVICE,
): Promise<void> {
  if (settings.definition !== registered) {
    const result = settings.definition
      ? await deps.register(BUTTON_TYPE_LASSO, ['NOTE'], {
          id: DEFINE_BUTTON_ID,
          name: copy['button.define'],
          editDataTypes: [EDIT_DATA_STROKES],
          showType: SHOW_NO_VIEW,
        })
      : await deps.unregister(DEFINE_BUTTON_ID);
    deps.log(
      describe(
        `${settings.definition ? 'register' : 'unregister'} ${copy['button.define']}`,
        result,
      ),
    );
    if (result.ok) {
      registered = settings.definition;
    }
  }
  if (!settings.definition) {
    return;
  }
  for (const need of NEEDS) {
    const granted = await deps.hasPermission(need.permission);
    if (granted.ok && granted.value) {
      continue;
    }
    const asked = await deps.requestPermission(need.permission, need.reason);
    deps.log(describe(`request ${need.permission}`, asked));
  }
}

export function resetButtonsForTests(): void {
  registered = false;
}
