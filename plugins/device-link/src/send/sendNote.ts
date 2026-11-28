/**
 * «Send Note» (#504): the open note's file goes whole to the picked LocalSend receiver, under its
 * own name, so the Mac gets the `.note` itself and not a picture of a page. The note is never
 * copied or changed on the tablet.
 */
import {copy} from '../copy';
import {Relay} from '../native';
import {NOTE_FILE_TYPE} from '../receive/remote';
import {Delivered, Relocate, sendFile, sendLog} from './sendPng';
import type {Device} from '../localsend/protocol';
import type {Self} from '../settings/device';

/** The file name a note is offered under: its own, with no folder. */
export function noteFileName(notePath: string): string {
  return notePath.slice(notePath.lastIndexOf('/') + 1);
}

/** Where a note goes, and what to do when its saved address does not answer. */
export type NoteTarget = {device: Device; relocate?: Relocate; delivered?: Delivered};

/** Sends the note at `notePath` (null: no note open); answers the toast line. */
export async function sendNote(
  native: Relay,
  sender: Self,
  {device, relocate, delivered}: NoteTarget,
  notePath: string | null,
): Promise<string> {
  if (notePath === null || !notePath.toLowerCase().endsWith('.note')) {
    return copy.noNote;
  }
  const line = await sendFile(
    native,
    sender,
    device,
    notePath,
    noteFileName(notePath),
    relocate,
    delivered,
    NOTE_FILE_TYPE,
  );
  sendLog(`note: ${line}`);
  return line;
}
