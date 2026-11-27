/**
 * The plain shapes the adapter and the packages above it share (#491). They sit here, in the lower
 * layer, so `ink-core` imports them from `sn-adapter` and `sn-adapter` imports nothing from `ink-core`
 * (docs/architecture.md › Layer rules).
 */

/** A rectangle on the page, in the page's own units. */
export type Rect = {left: number; top: number; right: number; bottom: number};
/** A width and a height. */
export type Size = {width: number; height: number};

/**
 * A call's result: its value, or the caller's own failure shape (#109), so a plugin's Result fits it
 * unchanged.
 */
export type Outcome<T, F extends {ok: false; message: string}> =
  | {ok: true; value: T}
  | F;
