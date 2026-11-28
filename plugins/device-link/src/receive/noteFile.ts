/**
 * A received whole note (#504): the `.note` file LocalSend brought is moved into `Note/` under the
 * sender's name. A note already there is never replaced: the received copy takes the next free
 * name (` 2`, ` 3`…) and the line says both are kept. The note open on the screen is refused with
 * the reason, since the host still writes it.
 * shortcut: any note of the same name counts as possibly newer, since the offer carries no time
 * the tablet can compare; read LocalSend's `metadata.modified` once a device round shows it sent.
 */
import {copy} from '../copy';
import {Relay} from '../native';
import {NOTE_DIR} from './pdfNote';

/** How many ` 2`, ` 3`… names are tried before the note is refused. */
const MAX_NAME_TRIES = 50;

/** The open note's path from a page key (`<note path>#<page>`), or null with no note open. */
export function openNotePath(pageKey: string | null): string | null {
  if (pageKey === null) {
    return null;
  }
  const mark = pageKey.lastIndexOf('#');
  return mark < 0 ? pageKey : pageKey.slice(0, mark);
}

export function notePath(name: string, copyNumber = 1): string {
  return `${NOTE_DIR}/${copyNumber === 1 ? name : `${name} ${copyNumber}`}.note`;
}

/** Places the received note at `received`; answers the toast line. */
export async function placeNote(
  native: Relay,
  received: string,
  name: string,
  openNote: string | null,
): Promise<string> {
  if (openNote !== null && openNote === notePath(name)) {
    await native.remove(received);
    return copy.noteOpen(name);
  }
  for (let n = 1; n <= MAX_NAME_TRIES; n++) {
    const target = notePath(name, n);
    if (target === openNote) {
      continue;
    }
    const taken = await native.exists(target);
    if (!taken.ok) {
      break;
    }
    if (taken.value) {
      continue;
    }
    const moved = await native.move(received, target);
    if (!moved.ok || moved.value !== true) {
      break;
    }
    return n === 1 ? copy.receivedNote(name) : copy.receivedNoteKept(name, `${name} ${n}`);
  }
  await native.remove(received);
  return copy.noteNotSaved(name);
}
