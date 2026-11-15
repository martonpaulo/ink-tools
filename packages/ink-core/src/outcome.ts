/**
 * A call's result: its value, or the caller's own failure shape (#109). The same shape as
 * Ink2Pic's `search-core` Outcome, so a plugin's Result fits it unchanged.
 */
export type Outcome<T, F extends {ok: false; message: string}> =
  | {ok: true; value: T}
  | F;
