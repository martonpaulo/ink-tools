/**
 * The failure sentences (#37) in Ink2Pic's copy: the mapping moved to picture-search's insert tier
 * for every plugin that inserts pictures (#142); this binds Ink2Pic's sentences to it.
 */
import {
  failureText as sharedFailureText,
  offlineText as sharedOfflineText,
  type StepFailure,
} from '../profile';
import {copy} from '../ui/copy';

export {atStep, FILE_PERMISSION_CODE, failureKeys} from '../profile';
export type {Done, Step, StepFailure} from '../profile';

export function failureText(failure: StepFailure): string {
  return sharedFailureText(failure, copy);
}

/** The sentence for a search that found no network (see the insert tier's `offlineText`). */
export function offlineText(): Promise<string> {
  return sharedOfflineText(copy);
}
