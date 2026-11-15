/**
 * The send flow (#98): make the PNG, offer it to the chosen receiver, upload it, say how it went,
 * and remove the PNG on every path.
 */
import {
  EMPTY_LASSO_CODE,
  Result,
  SHARED_ROOT,
} from '@supernote-tools/sn-adapter/official';
import {
  announce,
  Device,
  isPrivateAddress,
  LOCALSEND_PORT,
  MULTICAST_GROUP,
  parseAnnounce,
  parsePrepareUpload,
  parseUpload,
  prepareUploadBody,
  prepareUploadUrl,
  Sender,
  uploadUrl,
} from '../localsend/protocol';
import {Relay} from '../native';
import {copy} from '../copy';

/** Plan › Failure behaviour: every network step has its own limit. */
export const TIMEOUTS = {
  discoverMs: 3000,
  connectMs: 3000,
  // The receiver may wait for the person to accept.
  prepareMs: 10000,
  uploadMs: 30000,
} as const;

export const TEMP_DIR = `${SHARED_ROOT}/Relay/tmp`;

/** What one tap ends in: a line for the toast, or the Settings view to pick a device. */
export type Outcome = {kind: 'toast'; text: string} | {kind: 'choose'};

/** Every receiver that answers one announce, one per fingerprint, in answer order. */
export async function discoverDevices(
  native: Relay,
  sender: Sender,
): Promise<Result<Device[]>> {
  const answers = await native.discover(
    MULTICAST_GROUP,
    LOCALSEND_PORT,
    announce(sender),
    TIMEOUTS.discoverMs,
  );
  if (!answers.ok) {
    return answers;
  }
  const seen = new Map<string, Device>();
  for (const answer of answers.value) {
    const device = parseAnnounce(answer.text, answer.ip, sender);
    if (device !== null && !seen.has(device.fingerprint)) {
      seen.set(device.fingerprint, device);
    }
  }
  return {ok: true, value: [...seen.values()]};
}

function failureText(device: Device, moduleCode: string | undefined): string {
  return moduleCode === 'IDENTITY'
    ? copy.identityChanged(device.alias)
    : copy.unreachable(device.alias);
}

/** Offers and uploads one PNG; the answer is the toast line. */
export async function sendFile(
  native: Relay,
  sender: Sender,
  device: Device,
  path: string,
  fileName: string,
): Promise<string> {
  if (!isPrivateAddress(device.ip)) {
    return copy.notLocal(device.alias);
  }
  const pinned = device.protocol === 'https' ? device.fingerprint : null;
  const info = await native.fileInfo(path);
  if (!info.ok) {
    return copy.noImage;
  }
  const fileId = 'image';
  const prepared = await native.post(
    prepareUploadUrl(device),
    {'Content-Type': 'application/json'},
    prepareUploadBody(sender, {
      id: fileId,
      fileName,
      size: info.value.size,
      fileType: 'image/png',
      sha256: info.value.sha256,
    }),
    null,
    pinned,
    TIMEOUTS.connectMs,
    TIMEOUTS.prepareMs,
  );
  if (!prepared.ok) {
    return failureText(device, prepared.moduleCode);
  }
  const session = parsePrepareUpload(
    prepared.value.status,
    prepared.value.body,
    fileId,
  );
  if (session.kind !== 'session') {
    return copy.result(session, device.alias);
  }
  const uploaded = await native.post(
    uploadUrl(device, session, fileId),
    {'Content-Type': 'image/png'},
    null,
    path,
    pinned,
    TIMEOUTS.connectMs,
    TIMEOUTS.uploadMs,
  );
  if (!uploaded.ok) {
    return failureText(device, uploaded.moduleCode);
  }
  return copy.result(parseUpload(uploaded.value.status), device.alias);
}

/**
 * One tap: with no chosen device, the Settings view opens; otherwise `make` writes the PNG, which
 * is sent and then removed, whatever happened.
 */
export async function sendCapture(
  native: Relay,
  sender: Sender,
  device: Device | null,
  name: string,
  make: (pngPath: string) => Promise<Result<string>>,
  now: () => number = Date.now,
): Promise<Outcome> {
  if (device === null) {
    return {kind: 'choose'};
  }
  const fileName = `${name}-${now()}.png`;
  const pngPath = `${TEMP_DIR}/${fileName}`;
  let written: string | null = null;
  try {
    const made = await make(pngPath);
    if (!made.ok) {
      return {
        kind: 'toast',
        text:
          made.code === EMPTY_LASSO_CODE ? copy.nothingSelected : copy.noImage,
      };
    }
    written = made.value;
    return {
      kind: 'toast',
      text: await sendFile(native, sender, device, written, fileName),
    };
  } finally {
    await native.remove(pngPath);
    if (written !== null && written !== pngPath) {
      await native.remove(written);
    }
  }
}
