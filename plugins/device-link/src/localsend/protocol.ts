/**
 * LocalSend protocol v2 at the edge (#98): the announce, the prepare-upload body and the answers,
 * turned into our own types. The native module only moves bytes; everything it hands back is
 * untrusted and is checked here before use.
 *
 * Protocol: https://github.com/localsend/protocol (v2.1). The port, the API base and the message
 * limit come from `localsend-golden.json`, the golden file the Java tests and inkctl's test read too (#295).
 */
import golden from './localsend-golden.json';

/** The LocalSend port and multicast group every receiver listens on by default. */
export const LOCALSEND_PORT = golden.port;
export const MULTICAST_GROUP = '224.0.0.167';
export const PROTOCOL_VERSION = '2.1';

/** The largest multicast or HTTP answer we parse; anything longer is dropped (Plan › Security). */
export const MAX_ANSWER_BYTES = golden.maxMessageBytes;

export type Scheme = 'https' | 'http';

/** A LocalSend receiver as we keep it: the fingerprint tells two receivers with one alias apart. */
export type Device = {
  alias: string;
  ip: string;
  port: number;
  protocol: Scheme;
  fingerprint: string;
  deviceModel?: string;
};

/** Who we are to a receiver. */
export type Sender = {alias: string; fingerprint: string};

/** One file offered in a prepare-upload. */
export type Offer = {
  id: string;
  fileName: string;
  size: number;
  fileType: string;
  sha256?: string;
  /** A text's whole content (#99): a receiver shows it as a message. */
  preview?: string;
};

/** The outcome of one send, each with one message on the tablet (Plan › Failure behaviour). */
export type SendResult =
  | {kind: 'sent'}
  | {kind: 'declined'}
  | {kind: 'refused'}
  | {kind: 'busy'}
  | {kind: 'failed'; status: number};

/** A prepare-upload the receiver accepted: the session and the one token for our file. */
export type Session = {kind: 'session'; sessionId: string; fileToken: string};

function info(sender: Sender) {
  return {
    alias: sender.alias,
    version: PROTOCOL_VERSION,
    deviceModel: 'Supernote',
    // A tablet; while it receives (#49) it serves HTTPS on LOCALSEND_PORT. It offers no download.
    deviceType: 'mobile',
    fingerprint: sender.fingerprint,
    port: LOCALSEND_PORT,
    protocol: 'https',
    download: false,
  };
}

/** The multicast announce that asks every receiver on the network to answer. */
export function announce(sender: Sender): string {
  return JSON.stringify({...info(sender), announce: true});
}

/** The JSON body of `POST /api/localsend/v2/prepare-upload` for one file. */
export function prepareUploadBody(sender: Sender, offer: Offer): string {
  const file: Offer = {
    id: offer.id,
    fileName: offer.fileName,
    size: offer.size,
    fileType: offer.fileType,
  };
  if (offer.sha256 !== undefined) {
    file.sha256 = offer.sha256;
  }
  if (offer.preview !== undefined) {
    file.preview = offer.preview;
  }
  return JSON.stringify({info: info(sender), files: {[offer.id]: file}});
}

function baseUrl(device: Device): string {
  return `${device.protocol}://${device.ip}:${device.port}${golden.apiBase}`;
}

export function prepareUploadUrl(device: Device): string {
  return `${baseUrl(device)}/prepare-upload`;
}

export function uploadUrl(
  device: Device,
  session: Session,
  fileId: string,
): string {
  const query = [
    ['sessionId', session.sessionId],
    ['fileId', fileId],
    ['token', session.fileToken],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${baseUrl(device)}/upload?${query}`;
}

/** Parses JSON within the size limit; anything else is `undefined`. */
function parseJson(text: string): unknown {
  if (typeof text !== 'string' || text.length > MAX_ANSWER_BYTES) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function shortText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/**
 * True only for an IPv4 address in 10/8, 172.16/12 or 192.168/16: we never send outside the LAN
 * (Plan › Security).
 */
export function isPrivateAddress(ip: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (match === null) {
    return false;
  }
  const parts = match.slice(1).map(Number);
  if (parts.some(part => part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

/**
 * A receiver from one multicast answer, sent from `ip`; `null` for our own announce, a public
 * address, an oversized answer or an unknown shape.
 */
export function parseAnnounce(
  text: string,
  ip: string,
  self?: Sender,
): Device | null {
  const body = parseJson(text);
  if (!isRecord(body) || !isPrivateAddress(ip)) {
    return null;
  }
  const {alias, fingerprint, port, protocol, deviceModel} = body;
  if (!shortText(alias, 256) || !shortText(fingerprint, 256)) {
    return null;
  }
  if (self !== undefined && fingerprint === self.fingerprint) {
    return null;
  }
  const portNumber = port === undefined ? LOCALSEND_PORT : port;
  if (
    typeof portNumber !== 'number' ||
    !Number.isInteger(portNumber) ||
    portNumber < 1 ||
    portNumber > 65535
  ) {
    return null;
  }
  const scheme = protocol === undefined ? 'https' : protocol;
  if (scheme !== 'https' && scheme !== 'http') {
    return null;
  }
  const device: Device = {
    alias,
    ip,
    port: portNumber,
    protocol: scheme,
    fingerprint,
  };
  if (shortText(deviceModel, 256)) {
    device.deviceModel = deviceModel;
  }
  return device;
}

/**
 * The prepare-upload answer: 200 with a session and our file's token, or why not. 204 means the
 * receiver wants nothing, which is a refusal, never «sent» (Plan › Review focus).
 */
export function parsePrepareUpload(
  status: number,
  text: string,
  fileId: string,
): Session | SendResult {
  if (status === 204) {
    return {kind: 'refused'};
  }
  if (status === 403) {
    return {kind: 'declined'};
  }
  if (status === 409) {
    return {kind: 'busy'};
  }
  if (status !== 200) {
    return {kind: 'failed', status};
  }
  const body = parseJson(text);
  if (!isRecord(body) || !isRecord(body.files)) {
    return {kind: 'failed', status};
  }
  const {sessionId} = body;
  const token = body.files[fileId];
  if (!shortText(sessionId, 256) || !shortText(token, 256)) {
    return {kind: 'failed', status};
  }
  return {kind: 'session', sessionId, fileToken: token};
}

/** A text file name stays short: LocalSend shows it, and a page of text is no name. */
export const MAX_TEXT_NAME = 64;

/** The size LocalSend reads: UTF-8 bytes, never UTF-16 code units. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** `<first words>.txt`, letters and digits only, within MAX_TEXT_NAME; `text.txt` with none. */
export function textFileName(text: string): string {
  const words = text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const stem = [...words].slice(0, MAX_TEXT_NAME - '.txt'.length).join('').trim();
  return `${stem || 'text'}.txt`;
}

/** One text as LocalSend's own client offers it (#99): `text/plain` with the text as `preview`. */
export function textOffer(text: string): Offer {
  return {
    id: 'text',
    fileName: textFileName(text),
    size: utf8Bytes(text),
    fileType: 'text/plain',
    preview: text,
  };
}

/**
 * A text's prepare-upload answer: 204 is «sent», since a receiver that shows the `preview` as a
 * message needs no upload; a 200 asks for the bytes, as for a picture.
 */
export function parseTextPrepare(
  status: number,
  text: string,
  fileId: string,
): Session | SendResult {
  return status === 204 ? {kind: 'sent'} : parsePrepareUpload(status, text, fileId);
}

/** The upload answer: only 200 is «sent». */
export function parseUpload(status: number): SendResult {
  return status === 200 ? {kind: 'sent'} : {kind: 'failed', status};
}

/**
 * The receive half (#49). Our info as a receiver, for `/info`, `/register` and the multicast
 * answer; `fingerprint` is the SHA-256 of our v3 certificate.
 */
export function receiverInfo(self: Sender): string {
  return JSON.stringify(info(self));
}

/** The multicast answer to another device's announce. */
export function announceAnswer(self: Sender): string {
  return JSON.stringify({...info(self), announce: false});
}

/** The largest image or PDF we take; Java's `Receiver.MAX_FILE_BYTES` is the same number. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

/** The image types `insertImage` takes, with the extension the file is saved under. */
const IMAGE_TYPES: Record<string, 'png' | 'jpg'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
};

/** A scanned PDF, which becomes a note with its pages as backgrounds (#143). */
export const PDF_TYPE = 'application/pdf';

/** What an offer brings, or why it is refused. */
export type Taken =
  | {kind: 'text'; text: string}
  | {kind: 'image'; fileId: string; extension: 'png' | 'jpg'}
  | {kind: 'pdf'; fileId: string}
  | {kind: 'refuse'; reason: 'type' | 'size' | 'shape'};

/** The answer to one prepare-upload, as `RelayLocalSend.answer` takes it. */
export type Decision = {
  status: number;
  body: string;
  fileId: string | null;
  extension: 'png' | 'jpg' | 'pdf' | null;
  taken: Taken;
};

/**
 * Reads one prepare-upload body: one text message (`text/plain` with its `preview`), one image
 * `insertImage` takes, or one PDF that becomes a note (#143). Anything else, two files included, is refused (Plan › Review focus).
 */
export function readOffer(text: string): Taken {
  const body = parseJson(text);
  if (!isRecord(body) || !isRecord(body.files)) {
    return {kind: 'refuse', reason: 'shape'};
  }
  const files = Object.entries(body.files);
  if (files.length !== 1) {
    return {kind: 'refuse', reason: 'shape'};
  }
  const [fileId, file] = files[0];
  if (!shortText(fileId, 256) || !isRecord(file) || typeof file.fileType !== 'string') {
    return {kind: 'refuse', reason: 'shape'};
  }
  const fileType = file.fileType.toLowerCase();
  if (fileType.startsWith('text/')) {
    return typeof file.preview === 'string' && file.preview.trim().length > 0
      ? {kind: 'text', text: file.preview}
      : {kind: 'refuse', reason: 'shape'};
  }
  const extension = fileType === PDF_TYPE ? 'pdf' : IMAGE_TYPES[fileType];
  if (extension === undefined) {
    return {kind: 'refuse', reason: 'type'};
  }
  if (
    typeof file.size !== 'number' ||
    !Number.isInteger(file.size) ||
    file.size < 1 ||
    file.size > MAX_FILE_BYTES
  ) {
    return {kind: 'refuse', reason: 'size'};
  }
  return extension === 'pdf'
    ? {kind: 'pdf', fileId}
    : {kind: 'image', fileId, extension};
}

/**
 * The answer to an offer: 204 for a text, whose preview is all we need; 200 with the session and
 * the one token for an image or a PDF; 403 otherwise.
 */
export function decideOffer(
  text: string,
  sessionId: string,
  token: string,
): Decision {
  const taken = readOffer(text);
  switch (taken.kind) {
    case 'text':
      return {status: 204, body: '', fileId: null, extension: null, taken};
    case 'image':
    case 'pdf':
      return {
        status: 200,
        body: JSON.stringify({sessionId, files: {[taken.fileId]: token}}),
        fileId: taken.fileId,
        extension: taken.kind === 'pdf' ? 'pdf' : taken.extension,
        taken,
      };
    case 'refuse':
      return {status: 403, body: '', fileId: null, extension: null, taken};
  }
}
