/**
 * One lasso button per enabled direction (#128): `ES→PT` and `PT→ES` while the Spanish – Portuguese
 * switch is on. A button exists only while its pair is on, as Ink2Pic's «Insert definition» does
 * (#115). Whether the host shows a button registered after start-up, and how several look in the
 * lasso menu, is TO TEST on the device.
 */
import {
  Direction,
  enabledDirections,
  LingoSettings,
  PAIRS,
} from '@supernote-tools/ink-core';
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

/** sn-plugin-lib's lasso toolbar button, for strokes, with no view (as Ink2Pic's src/buttons.ts). */
export const BUTTON_TYPE_LASSO = 2;
export const EDIT_DATA_STROKES = 0;
export const SHOW_NO_VIEW = 0;

/** The first direction button's id; each pair takes two ids in PAIRS order. */
export const FIRST_BUTTON_ID = 100;

export type DirectionButton = Direction & {id: number; name: string};

/**
 * Every direction button PAIRS can give, on or off: a pair's first direction is its languages in
 * order, the second the reverse. The id depends only on the pair's place, so it never changes
 * while PAIRS keeps its order.
 */
export const ALL_BUTTONS: readonly DirectionButton[] = PAIRS.flatMap(
  ({languages: [a, b]}, index) =>
    [
      {from: a, to: b},
      {from: b, to: a},
    ].map((direction, side) => ({
      ...direction,
      id: FIRST_BUTTON_ID + index * 2 + side,
      name: `${direction.from.toUpperCase()}→${direction.to.toUpperCase()}`,
    })),
);

/** The button of each direction the settings switch on, in PAIRS order. */
export function enabledButtons(settings: LingoSettings): DirectionButton[] {
  return enabledDirections(settings).map(
    ({from, to}) =>
      ALL_BUTTONS.find(b => b.from === from && b.to === to) as DirectionButton,
  );
}

/** The direction a pressed button stands for, or null for an id that is not Lingo's. */
export function buttonOf(id: number): DirectionButton | null {
  return ALL_BUTTONS.find(b => b.id === id) ?? null;
}

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
  log: line => console.log(`Lingo: ${line}`),
};

/** The ids the host holds now, as this runtime registered them. */
const registered = new Set<number>();

const describe = (what: string, result: Result<unknown>): string =>
  result.ok
    ? `${what}: ok`
    : `${what} failed: ${result.code} ${result.message}`;

/**
 * Registers the buttons of the directions switched on and removes the others. A failed call is
 * logged and leaves that button's state as it was, so the next change tries again.
 */
export async function syncButtons(
  settings: LingoSettings,
  deps: ButtonDeps = DEVICE,
): Promise<void> {
  const wanted = new Set(enabledButtons(settings).map(b => b.id));
  for (const button of ALL_BUTTONS) {
    const on = wanted.has(button.id);
    if (on === registered.has(button.id)) {
      continue;
    }
    const result = on
      ? await deps.register(BUTTON_TYPE_LASSO, ['NOTE'], {
          id: button.id,
          name: button.name,
          editDataTypes: [EDIT_DATA_STROKES],
          showType: SHOW_NO_VIEW,
        })
      : await deps.unregister(button.id);
    deps.log(
      describe(`${on ? 'register' : 'unregister'} ${button.name}`, result),
    );
    if (result.ok) {
      on ? registered.add(button.id) : registered.delete(button.id);
    }
  }
}

/**
 * What a direction button needs: Internet for the online dictionaries, and file read, without
 * which the host refuses the lasso calls with error 1503 (device round, 2026-11-16, #128).
 */
const NEEDS = [
  {permission: PERMISSION_INTERNET, reason: copy['permission.internet']},
  {permission: PERMISSION_FILE_READ, reason: copy['permission.files']},
] as const;

/**
 * The Settings path: the buttons follow the switches, and the first pair switched on asks for
 * each permission in NEEDS not granted yet, while the view is open to show the question.
 */
export async function settingsChanged(
  settings: LingoSettings,
  deps: ButtonDeps = DEVICE,
): Promise<void> {
  await syncButtons(settings, deps);
  if (enabledDirections(settings).length === 0) {
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
  registered.clear();
}
