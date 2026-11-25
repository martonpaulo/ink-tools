/**
 * What a tool reports when it cannot go on (#245, #255): after a check, what it needs; after a
 * failure, what failed. Screens draw it with `Needs` or `ErrorView`; the value holds no view.
 */

/** The one fix: an action the tool runs itself, or the exact steps only the owner can do. */
export type Fix = {label: string; run: () => void} | {steps: string[]};

export type Problem = {
  /** What is missing or what failed, in plain words. */
  what: string;
  /** Why the tool needs it, or why it failed, when known. */
  reason?: string;
  fix?: Fix;
};

/** The one name of the button that closes a full view (#255, card D69). */
export const CLOSE_TEXT = 'Close';
/** The button that runs a failed action again. */
export const RETRY_TEXT = 'Retry';

/** The reason a thrown value gives, or none: an empty or missing message is no reason. */
export function reasonOf(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return text.trim() || undefined;
}
