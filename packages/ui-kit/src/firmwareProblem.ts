/**
 * The notice a plugin shows at start when a firmware update turned a feature off (#492), as ui-kit's
 * Needs state: what is off, why, and what still works. Plain words, no registry id and no firmware
 * term. The value holds no view; `working.hold(problem, 'needs')` shows it.
 */
import type {Problem} from './problem';
import type {Working} from './working';

/** «A», «A and B», «A, B and C». */
function listed(features: readonly string[]): string {
  return features.length < 2 ? features.join('') : `${features.slice(0, -1).join(', ')} and ${features[features.length - 1]}`;
}

export const FIRMWARE_REASON = 'A Supernote update changed how the tablet works, so Ink Tools turned this off until it is checked again.';

/** The Needs problem for the features that are off, or null when none is: nothing extra is shown then. */
export function firmwareProblem(features: readonly string[], stillWorks: string): Problem | null {
  if (features.length === 0) {
    return null;
  }
  return {what: `${listed(features)} ${features.length === 1 ? 'is' : 'are'} turned off`, reason: `${FIRMWARE_REASON} ${stillWorks}`};
}

/** Holds the notice on `working`'s view, as a check's Needs state; false, with nothing held, when no feature is off. */
export async function holdFirmwareNotice(
  working: Working,
  features: readonly string[] | Promise<readonly string[]>,
  stillWorks: string,
): Promise<boolean> {
  const problem = firmwareProblem(await features, stillWorks);
  if (problem === null) {
    return false;
  }
  working.hold(problem, 'needs');
  return true;
}
