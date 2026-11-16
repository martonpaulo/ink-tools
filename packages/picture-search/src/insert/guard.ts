/**
 * One no-view press at a time (#93, moved from Ink2Pic for every plugin with a no-view button,
 * #142). JS timers may stop while no view is open (brief section 3.3, REPORTED), so a press never
 * waits on one: a press within `limitMs` of the running one is refused, and a later press starts
 * again instead of waiting for a run that may never end.
 */

/** The longest one press may take, measured with Date.now() (brief section 8.5). */
export const NO_VIEW_LIMIT_MS = 60000;

/** A press that may run: how long the one it replaces had run, and the call that ends it. */
export type PressTurn = {
  /** Milliseconds the earlier press had run when this one replaced it, or null. */
  replacedAfter: number | null;
  /** Ends this press; a newer press that replaced it is left running. */
  end: () => void;
};

export type PressGuard = {
  /** This press's turn, or null while another press is still within the limit. */
  take: (now?: number) => PressTurn | null;
};

export function createPressGuard(limitMs = NO_VIEW_LIMIT_MS): PressGuard {
  /** When the running press started, or null; a newer press holds `run`. */
  let runningSince: number | null = null;
  let run = 0;
  return {
    take: (now = Date.now()) => {
      const age = runningSince === null ? null : now - runningSince;
      if (age !== null && age <= limitMs) {
        return null;
      }
      runningSince = now;
      const own = ++run;
      return {
        replacedAfter: age,
        end: () => {
          if (run === own) {
            runningSince = null;
          }
        },
      };
    },
  };
}
