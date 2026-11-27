/**
 * Every write on a page of the open note goes through `onSavedPage` (#524): the four open-page
 * calls (`insertPageElements`, `modifyPageElements`, `deletePageElements`,
 * `batchUpdatePageElements`) rebuild the page from the host's page data and draw it again, so an
 * edit the Note app holds and has not saved (an erase, a paste, a move) is lost, and the page comes
 * back as it was saved [measured, Manta, 2026-11-27, `docs/supernote.md` › Plugins]. The official
 * docs ask for `saveCurrentNote` before such a write «to avoid data inconsistencies»; a write whose
 * save fails or answers false changes nothing and says why.
 */
import {PluginNoteAPI} from 'sn-plugin-lib';
import {attempt, fail, Result, UNSAVED_CODE, whyNot} from './result';

/** Writes the open note to its file, so a read of the file sees the newest strokes (#296). */
export function saveCurrentNote(): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.saveCurrentNote());
}

/** The words a refused write starts with, for the person and the log. */
export const UNSAVED_REFUSAL = 'The note could not be saved, so nothing was changed on the page';

/**
 * Runs `write` only once the open note saved (#524). A failed or `false` save is a failure with
 * `UNSAVED_CODE`, and `write` never runs.
 */
export async function onSavedPage<T>(
  write: () => Promise<Result<T>>,
  save: () => Promise<Result<boolean>> = saveCurrentNote,
): Promise<Result<T>> {
  const saved = await save();
  if (saved.ok && saved.value === true) {
    return write();
  }
  return fail(UNSAVED_CODE, `${UNSAVED_REFUSAL} (saveCurrentNote ${whyNot(saved)})`);
}
