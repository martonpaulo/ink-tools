/**
 * The two sidebar buttons (#184, #188), NOTE only, with no view: «Real-Time Text» switches the
 * mode, «Undo Conversion» undoes the last conversion; and the lasso button «Convert to Text»
 * (#250), for strokes, with no view, converts the whole lasso. sn-plugin-lib 0.2.3's `setButtonState` only
 * enables or disables a button, so the switch shows on or off by its icon, registered again on
 * each change, and a toast says the new state in words (no colour cue alone).
 */
import {
  BUTTON_TYPE_LASSO,
  BUTTON_TYPE_SIDEBAR,
  EDIT_DATA_STROKES,
  hasPermission,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  registerButton,
  requestPermission,
  Result,
  SHOW_NO_VIEW,
  unregisterButton,
} from '@ink-tools/sn-adapter/official';
import type {Problem} from '@ink-tools/ui-kit';
import {copy} from './copy';
import {
  Converter,
  undoLast,
  UndoHost,
  UndoOutcome,
} from '@ink-tools/ink-core/conversion';
import {convertLasso, LassoConvertHost, LassoOutcome} from './lasso';
import {getSettings, wordOptions} from './settings';

// sn-plugin-lib's button values, owned by sn-adapter (#295).
export {BUTTON_TYPE_LASSO, BUTTON_TYPE_SIDEBAR, EDIT_DATA_STROKES, SHOW_NO_VIEW};
export const MODE_BUTTON_ID = 100;
export const UNDO_BUTTON_ID = 101;
export const LASSO_BUTTON_ID = 102;

export type Icons = {on: string; off: string; undo: string; lasso: string};

export type ButtonHost = {
  register: typeof registerButton;
  unregister: typeof unregisterButton;
  hasPermission: typeof hasPermission;
  requestPermission: typeof requestPermission;
  makeConverter: () => Converter;
  undo: UndoHost;
  lasso: LassoConvertHost;
  toast: (text: string) => void;
  /**
   * The host's error tip (sn-adapter's `errorTip`, #296): only for a failure with nothing to retry
   * and no fix to offer, such as a pen-up listener the host refused; a failed tip falls back to a toast.
   */
  errorTip: (text: string) => Result<true>;
  /** Holds a failure on the tablet on ui-kit's Error state, with its reason and Close (#257). */
  fail: (problem: Problem) => void;
  log: (line: string) => void;
  icons: Icons;
};

/**
 * Both file permissions a no-view button needs «Always Allow» (#170): READ for the page size,
 * WRITE for the page change (code 1501 without it, #148).
 */
const NEEDS = [PERMISSION_FILE_READ, PERMISSION_FILE_WRITE] as const;

const describe = (what: string, result: Result<unknown>): string =>
  result.ok
    ? `${what}: ok`
    : `${what} failed: ${result.code} ${result.message}`;

/** The Error state of a conversion or undo that failed on the tablet (#257). */
function failed(what: string): Problem {
  return {what, reason: copy['error.again']};
}

export class Buttons {
  private converter: Converter | null = null;

  constructor(private readonly host: ButtonHost) {}

  get on(): boolean {
    return this.converter !== null;
  }

  private modeButton(on: boolean) {
    return {
      id: MODE_BUTTON_ID,
      name: copy['button.mode'],
      icon: on ? this.host.icons.on : this.host.icons.off,
      showType: SHOW_NO_VIEW,
    };
  }

  /** Registers every button at start-up, the switch in the state Settings start it in. */
  async registerAll(): Promise<void> {
    const {host} = this;
    host.log(
      describe(
        'register lasso',
        await host.register(BUTTON_TYPE_LASSO, ['NOTE'], {
          id: LASSO_BUTTON_ID,
          name: copy['button.lasso'],
          icon: host.icons.lasso,
          editDataTypes: [EDIT_DATA_STROKES],
          showType: SHOW_NO_VIEW,
        }),
      ),
    );
    host.log(
      describe(
        'register undo',
        await host.register(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
          id: UNDO_BUTTON_ID,
          name: copy['button.undo'],
          icon: host.icons.undo,
          showType: SHOW_NO_VIEW,
        }),
      ),
    );
    host.log(
      describe(
        'register mode',
        await host.register(
          BUTTON_TYPE_SIDEBAR,
          ['NOTE'],
          this.modeButton(false),
        ),
      ),
    );
    if (getSettings().startOn) {
      await this.turn(true, false);
    }
  }

  /**
   * Stops the mode and removes every button, as switching the module off in Settings does (#305):
   * the open words are dropped untouched, as turning the mode off drops them.
   */
  async unregisterAll(): Promise<void> {
    const {host} = this;
    this.converter?.turnOff();
    this.converter = null;
    for (const [what, id] of [
      ['lasso', LASSO_BUTTON_ID],
      ['undo', UNDO_BUTTON_ID],
      ['mode', MODE_BUTTON_ID],
    ] as const) {
      host.log(describe(`unregister ${what}`, await host.unregister(id)));
    }
  }

  /** True when every file permission is granted; otherwise asks, and the dialog shows next press. */
  private async permitted(): Promise<boolean> {
    for (const permission of NEEDS) {
      const granted = await this.host.hasPermission(permission);
      if (!granted.ok || !granted.value) {
        this.host.log(`permission ${permission} missing: asked`);
        this.host.requestPermission(permission).catch(() => {});
        return false;
      }
    }
    return true;
  }

  /** Turns the mode on or off; false when it could not turn on. */
  async turn(on: boolean, toast = true): Promise<boolean> {
    const {host} = this;
    if (on === this.on) {
      return true;
    }
    if (on) {
      if (!(await this.permitted())) {
        host.toast(copy['toast.permission']);
        return false;
      }
      const converter = host.makeConverter();
      const started = converter.start();
      host.log(describe('pen-up listener', started));
      if (!started.ok) {
        const tip = host.errorTip(copy['toast.failed']);
        if (!tip.ok) {
          host.log(describe('error tip', tip));
          host.toast(copy['toast.failed']);
        }
        return false;
      }
      this.converter = converter;
    } else {
      this.converter?.turnOff();
      this.converter = null;
    }
    // The icon follows the state; a failed swap keeps the mode and is logged.
    host.log(
      describe('unregister mode', await host.unregister(MODE_BUTTON_ID)),
    );
    host.log(
      describe(
        'register mode',
        await host.register(BUTTON_TYPE_SIDEBAR, ['NOTE'], this.modeButton(on)),
      ),
    );
    if (toast) {
      host.toast(on ? copy['toast.on'] : copy['toast.off']);
    }
    return true;
  }

  /** A press of one of the buttons; false for an id that is not this plugin's. */
  press(id: number): boolean {
    if (id === MODE_BUTTON_ID) {
      this.turn(!this.on).catch(error =>
        this.host.log(`mode: ${String(error)}`),
      );
      return true;
    }
    if (id === UNDO_BUTTON_ID) {
      this.undo().catch(error => this.host.log(`undo: ${String(error)}`));
      return true;
    }
    if (id === LASSO_BUTTON_ID) {
      this.convertLasso().catch(error =>
        this.host.log(`lasso: ${String(error)}`),
      );
      return true;
    }
    return false;
  }

  /** «Convert to Text» (#250); null when a file permission is still missing. */
  async convertLasso(): Promise<LassoOutcome | null> {
    if (!(await this.permitted())) {
      this.host.toast(copy['toast.permission']);
      return null;
    }
    // A word still converting finishes first, so «Undo Conversion» keeps the lasso's conversion.
    await this.converter?.idle();
    const outcome = await convertLasso(this.host.lasso);
    if (outcome === 'failed') {
      this.host.fail(failed(copy['toast.convertFailed']));
    } else {
      this.host.toast(
        outcome === 'converted' ? copy['toast.converted'] : copy['toast.empty'],
      );
    }
    return outcome;
  }

  async undo(): Promise<UndoOutcome> {
    // A word still converting finishes first, so the undo meets the page it left.
    await this.converter?.idle();
    const outcome = await undoLast(this.host.undo);
    if (outcome === 'failed') {
      this.host.fail(failed(copy['toast.undoFailed']));
    } else {
      this.host.toast(
        outcome === 'undone' ? copy['toast.undone'] : copy['toast.nothing'],
      );
    }
    return outcome;
  }
}

/** The converter for the current settings, read when the mode turns on. */
export function converterFor(
  host: ConstructorParameters<typeof Converter>[0],
): Converter {
  return new Converter(host, wordOptions(getSettings()));
}
