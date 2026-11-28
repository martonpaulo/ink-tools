/**
 * Note Editor's route to the tablet through Device Link (#493), with no adb and no inkctl: the Mac
 * sends one LocalSend offer of `EDITOR_FILE_TYPE` to the receiver, whose `preview` is one request,
 * and the answer's body is the reply. The receiver opens only the LocalSend port, over HTTPS with
 * the tablet's certificate, and every request but `pair` needs the grant of a Mac paired once: a
 * random secret the tablet answered it.
 *
 * Requests (the `preview` JSON):
 * - `{"request": "pair"}`: the tablet shows a code for `PAIR_CODE_MS`; answered 202.
 * - `{"request": "pair", "code": "123456"}`: the code shown, from the same Mac (its LocalSend
 *   fingerprint); answered 200 with the grant, which the Mac keeps. One try per code.
 * - `{"request": "edit", "grant": ..., "args": {"path": ..., "ops": [...]}}`: the editor helper's
 *   action `edit` (`src/editor/operations.ts`); answered 200 with its result, 422 with its refusal.
 * - `{"request": "pull", "grant": ..., "path": ..., "reply": {"ip": ..., "port": ...}}`: the whole
 *   note is sent back to the paired Mac's own LocalSend receiver, pinned to its fingerprint, so no
 *   other device can take it; answered 202 before the send.
 *
 * shortcut: a picture an edit names must already be in `EDITOR_FOLDER`, as inkctl puts it there;
 * a picture sent over Device Link comes with Note Editor's adapter (#493's Mac task).
 */
import {ActionRefused, type ActionResult} from '@ink-tools/sn-adapter/official';
import {copy} from '../copy';
import {isNotePath} from '../editor/operations';
import {PEN_PAUSE} from '../editor/penGate';
import {Device, isPrivateAddress, MAX_ANSWER_BYTES, shortText} from '../localsend/protocol';
import {Relay} from '../native';
import {sendFile} from '../send/sendPng';
import type {Self} from '../settings/device';

/** How long a pairing code shown on the tablet stays good. */
export const PAIR_CODE_MS = 2 * 60 * 1000;
export const PAIR_CODE_DIGITS = 6;
/**
 * How long an edit waits for the pen to lift before it is refused, a quarter of the helper's own
 * wait (5 s): below the native receiver's wait for an answer (`RelayModule.DECIDE_MS`, 10 s),
 * past which the Mac reads a 500.
 */
export const EDIT_PEN_MS = PEN_PAUSE.waitMs / 4;
/** The HTTP status of each answer the Mac reads. */
export const STATUS = {
  done: 200,
  accepted: 202,
  badRequest: 400,
  refused: 403,
  editRefused: 422,
  failed: 500,
  noEditor: 503,
} as const;
/** The hex digits of the offer token a pairing code is read from: 48 bits, past a million codes. */
const CODE_HEX_DIGITS = 12;
const MAX_PORT = 65535;
/** A pulled note's LocalSend type: the tablet's `.note` file, as bytes. */
export const NOTE_FILE_TYPE = 'application/octet-stream';

export type Paired = {fingerprint: string; grant: string};
export type PendingCode = {code: string; fingerprint: string; until: number};
export type Pairing = {paired: Paired | null; pending: PendingCode | null};

export type RemoteMessage =
  | {request: 'pair'; code: string | null}
  | {request: 'edit'; grant: string; args: Record<string, unknown>}
  | {request: 'pull'; grant: string; path: string; reply: {ip: string; port: number}};

/** One offer's answer, a line for the tablet when there is one, and work to run once it is sent. */
export type Handled = {status: number; body: string; line: string | null; after: (() => Promise<string>) | null};

/** The editor helper's action `edit`, which `index.js` hands over with a pen wait of EDIT_PEN_MS. */
export type RemoteEdit = (args: Record<string, unknown>) => Promise<ActionResult>;

let edit: RemoteEdit | null = null;

/** Lets the receiver run Note Editor's edits; null turns them off again. */
export function serveEdits(next: RemoteEdit | null): void {
  edit = next;
}

export function pairingPath(pluginDir: string): string {
  return `${pluginDir}/pairing.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


/** Equal strings, compared in a time that does not depend on where they differ. */
export function sameSecret(a: string, b: string): boolean {
  let differ = a.length === b.length ? 0 : 1;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    differ += (a.charCodeAt(index) || 0) === (b.charCodeAt(index) || 0) ? 0 : 1;
  }
  return differ === 0;
}

/** The pairing file, or nothing paired and no code when it is missing or unreadable. */
export function readPairing(text: string | null): Pairing {
  const none: Pairing = {paired: null, pending: null};
  if (text === null) {
    return none;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return none;
  }
  if (!isRecord(value)) {
    return none;
  }
  const {paired, pending} = value;
  return {
    paired: isRecord(paired) && shortText(paired.fingerprint) && shortText(paired.grant) ? {fingerprint: paired.fingerprint, grant: paired.grant} : null,
    pending:
      isRecord(pending) && shortText(pending.code) && shortText(pending.fingerprint) && typeof pending.until === 'number'
        ? {code: pending.code, fingerprint: pending.fingerprint, until: pending.until}
        : null,
  };
}

export async function loadPairing(native: Relay, pluginDir: string): Promise<Pairing> {
  const read = await native.readText(pairingPath(pluginDir));
  return readPairing(read.ok ? read.value : null);
}

async function savePairing(native: Relay, pluginDir: string, pairing: Pairing): Promise<boolean> {
  return (await native.writeText(pairingPath(pluginDir), JSON.stringify(pairing))).ok;
}

/** A code of PAIR_CODE_DIGITS digits from the receiver's random offer token (SecureRandom hex). */
export function pairCode(randomHex: string): string {
  const value = parseInt(randomHex.slice(0, CODE_HEX_DIGITS), 16);
  return String(value % 10 ** PAIR_CODE_DIGITS).padStart(PAIR_CODE_DIGITS, '0');
}

/** One request, or null for an unknown shape. */
export function readMessage(text: string): RemoteMessage | null {
  if (typeof text !== 'string' || text.length > MAX_ANSWER_BYTES) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (value.request === 'pair') {
    if (value.code === undefined) {
      return {request: 'pair', code: null};
    }
    return shortText(value.code, 16) ? {request: 'pair', code: value.code} : null;
  }
  if (!shortText(value.grant)) {
    return null;
  }
  if (value.request === 'edit') {
    return isRecord(value.args) ? {request: 'edit', grant: value.grant, args: value.args} : null;
  }
  if (value.request === 'pull') {
    const {reply} = value;
    if (
      !isNotePath(value.path) ||
      !isRecord(reply) ||
      typeof reply.ip !== 'string' ||
      !isPrivateAddress(reply.ip) ||
      typeof reply.port !== 'number' ||
      !Number.isInteger(reply.port) ||
      reply.port < 1 ||
      reply.port > MAX_PORT
    ) {
      return null;
    }
    return {request: 'pull', grant: value.grant, path: value.path, reply: {ip: reply.ip, port: reply.port}};
  }
  return null;
}

function answer(status: number, body: object, line: string | null = null, after: Handled['after'] = null): Handled {
  return {status, body: JSON.stringify(body), line, after};
}

/** The sender as the offer's `info` names it: its LocalSend fingerprint and alias. */
function sender(info: unknown): {fingerprint: string; alias: string} | null {
  if (!isRecord(info) || !shortText(info.fingerprint)) {
    return null;
  }
  return {fingerprint: info.fingerprint, alias: shortText(info.alias) ? info.alias : 'Mac'};
}

async function pair(native: Relay, dir: string, from: {fingerprint: string; alias: string}, code: string | null, offerToken: string, now: number): Promise<Handled> {
  const pairing = await loadPairing(native, dir);
  if (code === null) {
    const shown = pairCode(offerToken);
    const saved = await savePairing(native, dir, {...pairing, pending: {code: shown, fingerprint: from.fingerprint, until: now + PAIR_CODE_MS}});
    return saved ? answer(STATUS.accepted, {pairing: 'code shown on the tablet'}, copy.pairCode(from.alias, shown)) : answer(STATUS.failed, {refusal: 'not-saved'});
  }
  const pending = pairing.pending;
  const good = pending !== null && now <= pending.until && pending.fingerprint === from.fingerprint && sameSecret(code, pending.code);
  // One try per code: a wrong one ends it, so a code cannot be guessed.
  const next: Pairing = good ? {paired: {fingerprint: from.fingerprint, grant: offerToken}, pending: null} : {...pairing, pending: null};
  const saved = await savePairing(native, dir, next);
  if (!good) {
    return answer(STATUS.refused, {refusal: 'pair-refused'}, copy.pairRefused);
  }
  return saved ? answer(STATUS.done, {grant: offerToken}, copy.paired(from.alias)) : answer(STATUS.failed, {refusal: 'not-saved'});
}

/**
 * Answers one Note Editor offer: its message, the offer's `info`, and the token the receiver drew
 * for it at random. Never runs an edit or a pull for a Mac that is not the paired one.
 */
export async function handleRemote(
  native: Relay,
  self: Self,
  pluginDir: string,
  message: string,
  info: unknown,
  offerToken: string,
  log: (line: string) => void,
  now: () => number = Date.now,
): Promise<Handled> {
  const from = sender(info);
  const request = readMessage(message);
  if (from === null || request === null) {
    log('remote: a request of an unknown shape was refused');
    return answer(STATUS.badRequest, {refusal: 'bad-request'});
  }
  if (request.request === 'pair') {
    log(`remote: pair ${request.code === null ? 'asked' : 'confirmed'}`);
    return pair(native, pluginDir, from, request.code, offerToken, now());
  }
  const {paired} = await loadPairing(native, pluginDir);
  if (paired === null || paired.fingerprint !== from.fingerprint || !sameSecret(request.grant, paired.grant)) {
    log(`remote: ${request.request} refused: not the paired Mac`);
    return answer(STATUS.refused, {refusal: 'unpaired'});
  }
  if (request.request === 'edit') {
    if (edit === null) {
      return answer(STATUS.noEditor, {refusal: 'no-editor'});
    }
    try {
      return answer(STATUS.done, {ok: true, ...(await edit(request.args))});
    } catch (error) {
      if (error instanceof ActionRefused) {
        return answer(STATUS.editRefused, {ok: false, message: error.message, ...error.detail});
      }
      log(`remote: edit failed: ${(error as Error).message}`);
      return answer(STATUS.failed, {ok: false, message: (error as Error).message});
    }
  }
  const device: Device = {alias: from.alias, ip: request.reply.ip, port: request.reply.port, protocol: 'https', fingerprint: paired.fingerprint};
  const name = request.path.slice(request.path.lastIndexOf('/') + 1);
  log(`remote: pull of one note to ${from.alias}`);
  return answer(STATUS.accepted, {pull: 'sending'}, null, () => sendFile(native, self, device, request.path, name, undefined, undefined, NOTE_FILE_TYPE));
}
