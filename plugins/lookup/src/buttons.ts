/**
 * Lookup's lasso buttons follow their Settings switches (#115, #111, #174): each button exists only while
 * its switch is on, as Lingo's direction buttons do (#128). At start-up the saved switches register
 * their buttons; turning one on in Settings also asks for each permission its press needs, while
 * the view is open to show the question.
 */
import {
  hasPermission,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  PERMISSION_INTERNET,
  registerButton,
  requestPermission,
  Result,
  unregisterButton,
} from '@supernote-tools/sn-adapter/official';
import {copy} from './copy';
import {DEFINE_BUTTON_ID} from './definition';
import {iconUri} from './icons';
import {SUMMARY_BUTTON_ID} from './summary';
import {
  CHOOSE_BUTTON_ID,
  CHOOSE_BUTTON_NAME,
  MODES,
  TRANSLATIONS,
} from './modes';
import type {LookupSettings, SwitchKey} from './settings';

/** sn-plugin-lib's lasso toolbar button, for strokes, with no view (as Lingo's src/buttons.ts). */
export const BUTTON_TYPE_LASSO = 2;
export const EDIT_DATA_STROKES = 0;
export const SHOW_NO_VIEW = 0;

type Need = {permission: string; reason: string};

const INTERNET: Need = {
  permission: PERMISSION_INTERNET,
  reason: copy['permission.internet'],
};
/** Without file read the host refuses the lasso calls with error 1503 (device round, 2026-11-16, #128). */
const FILE_READ: Need = {
  permission: PERMISSION_FILE_READ,
  reason: copy['permission.files'],
};
/** The settings file is written to MyStyle/Lookup, and each picture goes in the note (#142). */
const FILE_WRITE: Need = {
  permission: PERMISSION_FILE_WRITE,
  reason: copy['permission.write'],
};

/**
 * Where a button's switch lives in the settings: a named switch, or one key of the `directions`
 * map (#174).
 */
export type SwitchRef = {key: SwitchKey} | {direction: string};

/** One lasso button: its switch, its id and name, and what its press needs. */
export type LassoButton = {
  switch: SwitchRef;
  id: number;
  name: string;
  /** Its icon file in `assets/`, distinct for each button (#107). */
  icon: string;
  needs: readonly Need[];
};

/** Whether `button`'s switch is on in `settings`. */
export const isOn = (settings: LookupSettings, {switch: ref}: LassoButton) =>
  'key' in ref
    ? settings[ref.key]
    : settings.directions[ref.direction] === true;

/** `settings` with `button`'s switch set to `on`; the input is never changed. */
export const withSwitch = (
  settings: LookupSettings,
  {switch: ref}: LassoButton,
  on: boolean,
): LookupSettings =>
  'key' in ref
    ? {...settings, [ref.key]: on}
    : {...settings, directions: {...settings.directions, [ref.direction]: on}};

const TRANSLATE_NEEDS: readonly Need[] = [
  {...INTERNET, reason: copy['permission.translate']},
  FILE_READ,
];

export const BUTTONS: readonly LassoButton[] = [
  ...MODES.map(mode => ({
    switch: {key: mode.settingKey},
    id: mode.buttonId,
    name: mode.name,
    icon: mode.icon,
    needs: [
      {...INTERNET, reason: copy['permission.pictures']},
      FILE_READ,
      FILE_WRITE,
    ],
  })),
  {
    switch: {key: 'choose'},
    id: CHOOSE_BUTTON_ID,
    name: CHOOSE_BUTTON_NAME,
    icon: 'choose.png',
    needs: [
      {...INTERNET, reason: copy['permission.pictures']},
      FILE_READ,
      FILE_WRITE,
    ],
  },
  {
    switch: {key: 'definition'},
    id: DEFINE_BUTTON_ID,
    name: copy['button.define'],
    icon: 'definition.png',
    needs: [INTERNET, FILE_READ],
  },
  {
    switch: {key: 'summary'},
    id: SUMMARY_BUTTON_ID,
    name: copy['button.summary'],
    icon: 'summary.png',
    needs: [{...INTERNET, reason: copy['permission.summary']}, FILE_READ],
  },
  ...TRANSLATIONS.map(translation => ({
    switch: {direction: translation.key},
    id: translation.buttonId,
    name: translation.name,
    icon: translation.icon,
    needs: TRANSLATE_NEEDS,
  })),
];

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

/** The buttons the host holds now, as this runtime registered them. */
const registered = new Set<number>();

const describe = (what: string, result: Result<unknown>): string =>
  result.ok
    ? `${what}: ok`
    : `${what} failed: ${result.code} ${result.message}`;

/**
 * Each button follows its switch; a failed call is logged and leaves the state as it was, so the
 * next change tries again. Turning a switch off and on again leaves one button, never two.
 */
export async function syncButtons(
  settings: LookupSettings,
  deps: ButtonDeps = DEVICE,
): Promise<void> {
  for (const button of BUTTONS) {
    const on = isOn(settings, button);
    if (on === registered.has(button.id)) {
      continue;
    }
    const result = on
      ? await deps.register(BUTTON_TYPE_LASSO, ['NOTE'], {
          id: button.id,
          name: button.name,
          icon: iconUri(button.icon),
          editDataTypes: [EDIT_DATA_STROKES],
          showType: SHOW_NO_VIEW,
        })
      : await deps.unregister(button.id);
    deps.log(
      describe(`${on ? 'register' : 'unregister'} ${button.name}`, result),
    );
    if (result.ok) {
      if (on) {
        registered.add(button.id);
      } else {
        registered.delete(button.id);
      }
    }
  }
}

/** The permissions the buttons that are on need and the host has not granted, each once. */
export async function missingFor(
  buttons: readonly LassoButton[],
  deps: Pick<ButtonDeps, 'hasPermission'> = DEVICE,
): Promise<Need[]> {
  const missing: Need[] = [];
  for (const need of buttons.flatMap(button => button.needs)) {
    if (missing.some(known => known.permission === need.permission)) {
      continue;
    }
    const granted = await deps.hasPermission(need.permission);
    if (!(granted.ok && granted.value)) {
      missing.push(need);
    }
  }
  return missing;
}

/** Asks for each permission a switched-on button needs and the host has not granted. */
export async function askMissing(
  settings: LookupSettings,
  deps: ButtonDeps = DEVICE,
): Promise<void> {
  const on = BUTTONS.filter(button => isOn(settings, button));
  for (const need of await missingFor(on, deps)) {
    const asked = await deps.requestPermission(need.permission, need.reason);
    deps.log(describe(`request ${need.permission}`, asked));
  }
}

/** The Settings path: the buttons follow the switches, then each missing permission is asked. */
export async function settingsChanged(
  settings: LookupSettings,
  deps: ButtonDeps = DEVICE,
): Promise<void> {
  await syncButtons(settings, deps);
  await askMissing(settings, deps);
}

export function resetButtonsForTests(): void {
  registered.clear();
}
