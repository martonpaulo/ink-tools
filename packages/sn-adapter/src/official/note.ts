import {PluginNoteAPI} from 'sn-plugin-lib';
import {textBoxFields} from './elements';
import {attempt, Result} from './result';

/** png, jpg or jpeg only; the host chooses placement and size (brief section 4.4). */
export function insertImage(path: string): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.insertImage(path));
}

/** The text box a plugin inserts: the SDK's `TextBox` fields this repository sets (#115). */
export type TextBoxInput = {
  text: string;
  /** Page pixels, as `PluginFileAPI.getPageSize` measures the page. */
  rect: {left: number; top: number; right: number; bottom: number};
  fontSize: number;
};

/**
 * Inserts a fixed-width, left-aligned, plain text box on the current page; the host's default
 * font. The fields follow sn-plugin-lib 0.2.3's `TextBox` model; on the device it is TO TEST.
 */
export function insertText(box: TextBoxInput): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.insertText(textBoxFields(box)));
}


/** Writes the open note to its file, so a read of the file sees the newest strokes (#296). */
export function saveCurrentNote(): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.saveCurrentNote());
}

/**
 * Saves the open note before a page export (#296): `generateNotePng` reads the file, so without it
 * the strokes drawn just before a send are not in the image. A failed or `false` save is logged and
 * the export goes on, as it did before; the line gives the save's time, for the device round.
 */
export async function saveBeforeExport(
  log: (line: string) => void,
  save: () => Promise<Result<boolean>> = saveCurrentNote,
  now: () => number = Date.now,
): Promise<void> {
  const started = now();
  const saved = await save();
  const ms = now() - started;
  if (saved.ok && saved.value === true) {
    log(`save: the note saved in ${ms} ms`);
    return;
  }
  const why = saved.ok ? 'answered false' : `failed: ${saved.code} ${saved.message}`;
  log(`save: ${why} in ${ms} ms: the page is exported as the file holds it`);
}
