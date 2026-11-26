/**
 * The action `save-note` (#426): saves the note open on screen, so inkctl can open another note
 * without losing what was done on this one. Opening a note by intent does not save the open one: a
 * native lasso delete and a Collection paste were missing from the file after `inkctl note open`
 * switched notes (device round 10, Manta, 2026-11-26).
 */
import type {ActionResult} from '@ink-tools/sn-adapter/official';
import type {EditHost} from './operations';

export function saveNoteAction(host: Pick<EditHost, 'openNote' | 'saveOpenNote'>) {
  return async (): Promise<ActionResult> => {
    const open = await host.openNote();
    if (!open.ok) {
      throw new Error(`getCurrentFilePath failed: ${open.code} ${open.message}`);
    }
    if (!open.value) {
      return {line: 'DeviceLink: save-note: no note is open', openNote: null, saved: false};
    }
    const saved = await host.saveOpenNote();
    if (!saved.ok || saved.value !== true) {
      throw new Error(`saveCurrentNote did not save ${open.value}: ${saved.ok ? 'answered false' : `${saved.code} ${saved.message}`}`);
    }
    return {line: `DeviceLink: save-note: saved ${open.value}`, openNote: open.value, saved: true};
  };
}
