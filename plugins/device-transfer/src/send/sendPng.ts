/**
 * The send flow (#98): make the PNG, offer it to the chosen receiver, upload it, say how it went,
 * and remove the PNG on every path.
 */
import {
  EMPTY_LASSO_CODE,
  getPluginDirPath,
  Result,
} from '@ink-tools/sn-adapter/official';
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
  receiverInfo,
  Sender,
  uploadUrl,
} from '../localsend/protocol';
import {HttpAnswer, Relay} from '../native';
import {copy} from '../copy';
import {Self} from '../settings/device';

/** Plan › Failure behaviour: every network step has its own limit. */
export const TIMEOUTS = {
  discoverMs: 3000,
  connectMs: 3000,
  // The receiver may wait for the person to accept.
  prepareMs: 10000,
  uploadMs: 30000,
} as const;

/**
 * Relay's temporary folder, inside its private folder (`getPluginDirPath`): a shared path such as
 * `/storage/emulated/0/Relay/tmp` is outside PluginHost's whitelist, so every write and delete
 * there fails (#164, `docs/supernote.md` › Plugins). It holds the sent PNGs, the received files
 * and the PDF pages.
 */
export function tempDir(pluginDir: string): string {
  return `${pluginDir}/tmp`;
}

/** What one tap ends in: a line for the toast, or the Settings view to pick a device. */
export type Outcome = {kind: 'toast'; text: string} | {kind: 'choose'};

/**
 * Every receiver that answers one announce, by multicast or by `/register`, one per fingerprint,
 * in answer order. LocalSend registers with the announcer first and answers by multicast only when
 * that fails, so the window serves `/register` with our identity (#98); without the private folder
 * only multicast answers count.
 */
export async function discoverDevices(
  native: Relay,
  sender: Sender,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<Result<Device[]>> {
  const dir = await pluginDir();
  const answers = await native.discover(
    MULTICAST_GROUP,
    LOCALSEND_PORT,
    announce(sender),
    TIMEOUTS.discoverMs,
    dir.ok ? dir.value : null,
    receiverInfo(sender),
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

/** One line of a send in the log (#98): steps, status codes, timings and the toast, never a body. */
export function sendLog(line: string): void {
  console.log(`Relay: send: ${line}`);
}

/**
 * One POST of a send, logged as `<step> <status> in <ms> ms`, or `<step> failed: <code>
 * <exception> in <ms> ms`, so a device round sees where a send stops (#98).
 */
export async function loggedPost(
  step: string,
  post: () => Promise<Result<HttpAnswer>>,
  now: () => number = Date.now,
): Promise<Result<HttpAnswer>> {
  const start = now();
  const answer = await post();
  const ms = now() - start;
  sendLog(
    answer.ok
      ? `${step} ${answer.value.status} in ${ms} ms`
      : `${step} failed: ${answer.moduleCode ?? answer.code} ${answer.message} in ${ms} ms`,
  );
  return answer;
}

/** The toast for a failed POST: a changed identity, else not reachable. */
export function failureText(device: Device, moduleCode: string | undefined): string {
  return moduleCode === 'IDENTITY'
    ? copy.identityChanged(device.alias)
    : copy.unreachable(device.alias);
}

/** Offers and uploads one PNG; the answer is the toast line. */
export async function sendFile(
  native: Relay,
  sender: Self,
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
  const prepared = await loggedPost('prepare-upload', () =>
    native.post(
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
      sender.identityFolder,
      TIMEOUTS.connectMs,
      TIMEOUTS.prepareMs,
    ),
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
  const uploaded = await loggedPost('upload', () =>
    native.post(
      uploadUrl(device, session, fileId),
      {'Content-Type': 'image/png'},
      null,
      path,
      pinned,
      sender.identityFolder,
      TIMEOUTS.connectMs,
      TIMEOUTS.uploadMs,
    ),
  );
  if (!uploaded.ok) {
    return failureText(device, uploaded.moduleCode);
  }
  return copy.result(parseUpload(uploaded.value.status), device.alias);
}

/**
 * One tap: with no chosen device, the Settings view opens; otherwise `make` writes the PNG in
 * `tmp` (`tempDir`), which is sent and then removed, whatever happened. The outcome is logged,
 * the toast line too, since the host's toast leaves no text in the log (#98).
 */
export async function sendCapture(
  native: Relay,
  sender: Self,
  device: Device | null,
  tmp: string,
  name: string,
  make: (pngPath: string) => Promise<Result<string>>,
  now: () => number = Date.now,
): Promise<Outcome> {
  const outcome = await capture(native, sender, device, tmp, name, make, now);
  sendLog(
    outcome.kind === 'toast'
      ? `${name}: ${outcome.text}`
      : `${name}: no device chosen, Settings opens`,
  );
  return outcome;
}

async function capture(
  native: Relay,
  sender: Self,
  device: Device | null,
  tmp: string,
  name: string,
  make: (pngPath: string) => Promise<Result<string>>,
  now: () => number,
): Promise<Outcome> {
  if (device === null) {
    return {kind: 'choose'};
  }
  const fileName = `${name}-${now()}.png`;
  const pngPath = `${tmp}/${fileName}`;
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
